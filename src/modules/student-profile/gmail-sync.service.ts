import { google } from 'googleapis';
import { db } from '../../core/database/client';
import { studentAssignments, studentEvaluations, syncState, campusEvents } from './student-profile.schema';
import { getAuthenticatedClient } from '../gmail-auth/gmail-auth.service';
import { eq, and, inArray } from 'drizzle-orm';
import { academicsService } from '../academics/academics.service';
import { sectionsService } from '../academics/sections.service';
import { VertexAI } from '@google-cloud/vertexai';

/**
 * Gmail Sync Service
 * Analyzes Gmail emails and extracts assignments/evaluations using AI
 */

interface ExtractedAssignment {
    courseCode: string;
    courseName: string;
    title: string;
    description: string;
    dueDate: string; // ISO string
    priority: 'low' | 'medium' | 'high';
    emailId?: string;
}

interface ExtractedEvaluation {
    courseCode: string;
    courseName: string;
    title: string;
    type: 'quiz' | 'exam' | 'report' | 'presentation' | 'project';
    date: string; // ISO string
    duration?: string;
    location?: string;
    description?: string;
    emailId?: string;
}

interface ExtractedEvent {
    title: string;
    type: 'competition' | 'recruitment' | 'workshop' | 'seminar' | 'hackathon' | 'conference' | 'cultural' | 'sports' | 'other';
    description?: string;
    organizer?: string;
    date: string; // ISO string
    endDate?: string; // ISO string
    registrationDeadline?: string; // ISO string
    location?: string;
    websiteUrl?: string;
    registrationUrl?: string;
    prizePool?: string;
    eligibility?: string;
    emailId?: string;
}

interface SyncResult {
    success: boolean;
    emailsAnalyzed: number;
    emailsSkipped: number;
    assignmentsCreated: number;
    evaluationsCreated: number;
    eventsCreated: number;
    errors: string[];
}

export class GmailSyncService {

    /**
     * Fetch recent emails from Gmail
     */
    private async fetchEmails(userId: string, afterTimestamp?: string): Promise<any[]> {
        const oauth2 = await getAuthenticatedClient(userId);
        if (!oauth2) {
            throw new Error('Gmail not connected');
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2 });

        // Build query: emails in inbox, not in trash/spam, after last sync time
        let query = 'in:inbox -in:spam -in:trash';

        // Filter by date if we have a last sync timestamp
        if (afterTimestamp) {
            const timestamp = parseInt(afterTimestamp);
            const date = new Date(timestamp);
            const dateStr = Math.floor(date.getTime() / 1000); // Unix timestamp in seconds
            query += ` after:${dateStr}`;
        } else {
            // First sync: get emails from last 30 days only
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            query += ` after:${thirtyDaysAgo}`;
        }

        console.log('[GmailSync] Query:', query);

        // Get list of message IDs
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50, // Limit to 50 most recent emails
        });

        const messages = listResponse.data.messages || [];

        if (messages.length === 0) {
            return [];
        }

        // Fetch full email details in parallel
        const emailPromises = messages.map(async (msg) => {
            const emailResponse = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'full',
            });
            return emailResponse.data;
        });

        const emails = await Promise.all(emailPromises);

        // Extract relevant data
        return emails.map(email => {
            const headers = email.payload?.headers || [];
            const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
            const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
            const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';

            // Get email body (plain text or HTML)
            let body = '';
            if (email.payload?.body?.data) {
                body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
            } else if (email.payload?.parts) {
                const textPart = email.payload.parts.find(p => p.mimeType === 'text/plain');
                if (textPart?.body?.data) {
                    body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                }
            }

            return {
                id: email.id,
                threadId: email.threadId,
                subject,
                from,
                date,
                body: body.substring(0, 500), // Limit body length
                internalDate: email.internalDate, // Unix timestamp in milliseconds
            };
        });
    }

    /**
     * Filter out already-processed emails to save AI tokens
     */
    private async filterUnprocessedEmails(emails: any[], userId: string): Promise<any[]> {
        if (emails.length === 0) return [];

        const emailIds = emails.map(e => e.id).filter(Boolean);
        if (emailIds.length === 0) return emails;

        // Check which emails are already processed (exist in assignments, evaluations, or events)
        const [existingAssignments, existingEvaluations, existingEvents] = await Promise.all([
            db.select({ sourceId: studentAssignments.sourceId })
                .from(studentAssignments)
                .where(and(
                    eq(studentAssignments.userId, userId),
                    eq(studentAssignments.sourceType, 'gmail'),
                    inArray(studentAssignments.sourceId, emailIds)
                )),
            db.select({ sourceId: studentEvaluations.sourceId })
                .from(studentEvaluations)
                .where(and(
                    eq(studentEvaluations.userId, userId),
                    eq(studentEvaluations.sourceType, 'gmail'),
                    inArray(studentEvaluations.sourceId, emailIds)
                )),
            db.select({ sourceId: campusEvents.sourceId })
                .from(campusEvents)
                .where(and(
                    eq(campusEvents.userId, userId),
                    eq(campusEvents.sourceType, 'gmail'),
                    inArray(campusEvents.sourceId, emailIds)
                )),
        ]);

        const processedEmailIds = new Set([
            ...existingAssignments.map(a => a.sourceId),
            ...existingEvaluations.map(e => e.sourceId),
            ...existingEvents.map(e => e.sourceId),
        ]);

        const unprocessedEmails = emails.filter(e => !processedEmailIds.has(e.id));

        console.log(`[GmailSync] Filtered: ${emails.length} total, ${processedEmailIds.size} already processed, ${unprocessedEmails.length} to analyze`);

        return unprocessedEmails;
    }

    /**
     * Analyze emails with AI and extract structured data
     */
    private async analyzeEmailsWithAI(emails: any[], userId: string): Promise<{
        assignments: ExtractedAssignment[];
        evaluations: ExtractedEvaluation[];
        events: ExtractedEvent[];
    }> {
        if (emails.length === 0) {
            return { assignments: [], evaluations: [], events: [] };
        }

        // Fetch user's enrolled courses for context
        const enrolledCourses = await academicsService.getUserCourses(userId);
        const coursesContext = enrolledCourses.map(ec => ({
            id: ec.course.id,
            code: ec.course.code,
            name: ec.course.name,
            professor: ec.course.professorName,
        }));

        // Fetch user's sections for additional context
        const userSchedule = await sectionsService.getUserSchedule(userId);
        const sectionsContext = userSchedule.map(s => ({
            courseCode: s.courseCode,
            sectionType: s.sectionType,
            sectionNumber: s.sectionNumber,
            instructors: s.instructors,
        }));

        console.log(`[GmailSync] User has ${coursesContext.length} enrolled courses`);

        // Prepare email text for AI analysis
        const emailText = emails.map((e, i) => {
            return `${i + 1}. Subject: ${e.subject} | From: ${e.from} | Date: ${e.date} | Body: ${e.body} | ID:${e.id}`;
        }).join('\n');

        // Use Gemini for analysis
        const projectId = process.env.GCP_PROJECT_ID;
        const location = 'global';
        const apiEndpoint = 'aiplatform.googleapis.com';

        if (!projectId) {
            throw new Error('GCP_PROJECT_ID not configured');
        }

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        const systemPrompt = `You are an AI assistant that analyzes Gmail emails and extracts assignments, evaluations, and campus events.

**USER'S ENROLLED COURSES:**
${JSON.stringify(coursesContext, null, 2)}

**USER'S REGISTERED SECTIONS:**
${JSON.stringify(sectionsContext, null, 2)}

IMPORTANT INSTRUCTIONS:

**CATEGORIZATION RULES (CRITICAL - READ CAREFULLY):**

1. **ASSIGNMENTS** = Course work, homework, lab submissions, projects, problem sets
   - Keywords: "assignment", "homework", "lab", "project", "problem set", "due", "submit", "upload"
   - MUST be related to a course from the enrolled courses list above
   - Goes to "assignments" array

2. **EVALUATIONS** = Exams, quizzes, tests ONLY
   - Keywords: "exam", "test", "quiz", "midterm", "final"
   - MUST be related to a course from the enrolled courses list above
   - Goes to "evaluations" array

3. **CAMPUS EVENTS** = Everything else happening on campus (BE VERY INCLUSIVE)
   - ✅ Include: Competitions, hackathons, workshops, seminars, talks, conferences, club events, cultural events, sports events, recruitment drives, guest lectures, career fairs, exhibitions, festivals, meetups, orientation programs, tech talks, coding contests, debate competitions, music/dance performances, sports tournaments, alumni events, industry visits, campus tours, student council elections, blood donation camps, social causes, NGO events, startup events, entrepreneurship summits, innovation challenges, research presentations, poster presentations, paper presentations, webinars, networking events, placement drives, internship opportunities, skill development workshops, certification programs, training sessions, open house events, college fests, department activities, club meetings, community service
   - ✅ Be FORGIVING - if an email mentions ANY campus activity, gathering, or opportunity (even loosely), categorize as event
   - ❌ NEVER include assignments, homework, labs, exams, tests, quizzes as events
   - ❌ Ignore: Pure promotional emails, spam, shopping, personal social media notifications
   - Extract: title, organizer, dates, registration deadlines, prize pools, eligibility, URLs
   - Goes to "events" array

**CRITICAL DATE RULES:**
- ONLY extract items with dates AFTER today (${today})
- Ignore anything that already happened

**COURSE MATCHING:**
- For assignments/evaluations: Match course codes EXACTLY from the enrolled courses list
- For events: NO course matching needed (they're campus-wide)

**PRIORITY (for assignments):**
- high: Due within 24 hours or marked urgent
- medium: Due within 7 days
- low: Due after 7 days

**EVENT TYPES:** competition, recruitment, workshop, seminar, hackathon, conference, cultural, sports, other

**OUTPUT FORMAT:** Return ONLY valid JSON, no markdown, no explanations

**EXAMPLE OUTPUT:**
{
  "assignments": [
    {
      "courseCode": "CS F111",
      "courseName": "Computer Programming",
      "title": "Lab 5: Linked Lists",
      "description": "Implement linked list operations",
      "dueDate": "2026-02-10T23:59:00.000Z",
      "priority": "high",
      "emailId": "abc123"
    }
  ],
  "evaluations": [
    {
      "courseCode": "MATH F112",
      "courseName": "Linear Algebra",
      "title": "Quiz 2: Matrices",
      "type": "quiz",
      "date": "2026-02-12T09:00:00.000Z",
      "duration": "60 minutes",
      "location": "Room 2205",
      "description": "Topics: Matrix operations",
      "emailId": "def456"
    }
  ],
  "events": [
    {
      "title": "Smart India Hackathon 2026",
      "type": "hackathon",
      "description": "36-hour national level hackathon building solutions for government challenges",
      "organizer": "Ministry of Education, Govt. of India",
      "date": "2026-03-15T09:00:00.000Z",
      "endDate": "2026-03-17T18:00:00.000Z",
      "registrationDeadline": "2026-02-28T23:59:00.000Z",
      "location": "BITS Pilani Campus",
      "websiteUrl": "https://sih.gov.in",
      "registrationUrl": "https://sih.gov.in/register",
      "prizePool": "Rs 1 Crore",
      "eligibility": "Students from all years",
      "emailId": "ghi789"
    },
    {
      "title": "Tech Talk: AI in Healthcare",
      "type": "seminar",
      "description": "Guest lecture by industry expert on AI applications in healthcare",
      "organizer": "Department of Computer Science",
      "date": "2026-02-15T14:00:00.000Z",
      "location": "Auditorium A",
      "emailId": "jkl012"
    },
    {
      "title": "Annual Sports Meet",
      "type": "sports",
      "description": "Inter-department sports competition",
      "organizer": "Sports Committee",
      "date": "2026-02-20T08:00:00.000Z",
      "endDate": "2026-02-22T18:00:00.000Z",
      "registrationDeadline": "2026-02-18T23:59:00.000Z",
      "location": "Sports Complex",
      "eligibility": "All students",
      "emailId": "mno345"
    }
  ]
}

**REMEMBER:**
- If nothing found in a category, return empty array []
- Events should be BROAD and INCLUSIVE - capture any campus activity
- NEVER put assignments, labs, homework, exams, tests, or quizzes in events array
- Evaluation types: quiz, exam, report, presentation, project
- Event types: competition, recruitment, workshop, seminar, hackathon, conference, cultural, sports, other`;

        console.log(`[GmailSync] Analyzing ${emails.length} emails with Gemini...`);

        try {
            const vertexAI = new VertexAI({ project: projectId, location, apiEndpoint });
            const model = vertexAI.getGenerativeModel({
                model: 'gemini-3-flash-preview-lite',
            });

            const userPrompt = `Analyze these Gmail emails and extract assignments, evaluations, and campus events:\n\n${emailText}`;

            const result = await model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: systemPrompt },
                            { text: '\n\n' },
                            { text: userPrompt }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4000,
                    responseMimeType: 'application/json',
                }
            });

            const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) {
                console.error('[GmailSync] Empty response from Gemini');
                return { assignments: [], evaluations: [], events: [] };
            }

            const parsed = JSON.parse(responseText);
            console.log(`[GmailSync] Extracted: ${parsed.assignments?.length || 0} assignments, ${parsed.evaluations?.length || 0} evaluations, ${parsed.events?.length || 0} events`);

            return {
                assignments: parsed.assignments || [],
                evaluations: parsed.evaluations || [],
                events: parsed.events || [],
            };
        } catch (error: any) {
            console.error('[GmailSync] Gemini analysis failed:', error.message);
            return { assignments: [], evaluations: [], events: [] };
        }
    }

    /**
     * Get or create sync state for Gmail
     */
    private async getSyncState(userId: string): Promise<{ lastEmailTimestamp?: string }> {
        const [state] = await db.select()
            .from(syncState)
            .where(and(
                eq(syncState.userId, userId),
                eq(syncState.source, 'gmail')
            ))
            .limit(1);

        return {
            lastEmailTimestamp: state?.lastEmailTimestamp || undefined,
        };
    }

    /**
     * Update sync state for Gmail
     */
    private async updateSyncState(userId: string, lastEmailTimestamp: string): Promise<void> {
        const existing = await db.select()
            .from(syncState)
            .where(and(
                eq(syncState.userId, userId),
                eq(syncState.source, 'gmail')
            ))
            .limit(1);

        if (existing.length > 0) {
            await db.update(syncState)
                .set({
                    lastEmailTimestamp,
                    lastSyncAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(syncState.userId, userId),
                    eq(syncState.source, 'gmail')
                ));
        } else {
            await db.insert(syncState).values({
                userId,
                source: 'gmail',
                lastEmailTimestamp,
                lastSyncAt: new Date(),
            });
        }
    }

    /**
     * Sync assignments and evaluations from Gmail
     */
    async syncFromGmail(userId: string): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            emailsAnalyzed: 0,
            emailsSkipped: 0,
            assignmentsCreated: 0,
            evaluationsCreated: 0,
            eventsCreated: 0,
            errors: [],
        };

        try {
            // Get last sync state
            const state = await this.getSyncState(userId);
            console.log('[GmailSync] Last sync timestamp:', state.lastEmailTimestamp);

            // Fetch emails
            console.log('[GmailSync] Fetching emails...');
            const allEmails = await this.fetchEmails(userId, state.lastEmailTimestamp);

            if (allEmails.length === 0) {
                console.log('[GmailSync] No new emails found');
                return result;
            }

            // Filter out already-processed emails to save AI tokens
            const emails = await this.filterUnprocessedEmails(allEmails, userId);
            result.emailsAnalyzed = emails.length;
            result.emailsSkipped = allEmails.length - emails.length;

            if (emails.length === 0) {
                console.log('[GmailSync] All emails already processed');
                return result;
            }

            console.log(`[GmailSync] Analyzing ${emails.length} new emails with AI...`);

            // Analyze with AI (pass userId for course context)
            const extracted = await this.analyzeEmailsWithAI(emails, userId);

            console.log(`[GmailSync] AI extracted: ${extracted.assignments.length} assignments, ${extracted.evaluations.length} evaluations, ${extracted.events.length} events`);

            // Create assignments (only future ones)
            const now = new Date();
            const enrolledCourses = await academicsService.getUserCourses(userId);

            for (const assignment of extracted.assignments) {
                try {
                    // Validate due date is in the future
                    const dueDate = new Date(assignment.dueDate);
                    if (dueDate <= now) {
                        console.log(`[GmailSync] Skipping past assignment: ${assignment.title} (due: ${assignment.dueDate})`);
                        continue;
                    }

                    // Check if already exists (by source_id)
                    const existing = await db.select()
                        .from(studentAssignments)
                        .where(
                            and(
                                eq(studentAssignments.userId, userId),
                                eq(studentAssignments.sourceType, 'gmail'),
                                eq(studentAssignments.sourceId, assignment.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Assignment already exists: ${assignment.title}`);
                        continue;
                    }

                    // Match courseCode to get courseId
                    const matchedCourse = enrolledCourses.find(
                        ec => ec.course.code?.toLowerCase() === assignment.courseCode?.toLowerCase()
                    );
                    const courseId = matchedCourse?.course.id || null;

                    if (courseId) {
                        console.log(`[GmailSync] Matched assignment to course: ${assignment.courseCode} -> ${courseId}`);
                    } else {
                        console.log(`[GmailSync] Could not match course code: ${assignment.courseCode}`);
                    }

                    await db.insert(studentAssignments).values({
                        userId,
                        courseId,
                        courseCode: assignment.courseCode,
                        courseName: assignment.courseName,
                        title: assignment.title,
                        description: assignment.description,
                        dueDate: new Date(assignment.dueDate),
                        priority: assignment.priority,
                        status: 'not_started',
                        sourceType: 'gmail',
                        sourceId: assignment.emailId,
                    });

                    result.assignmentsCreated++;
                    console.log(`[GmailSync] Created assignment: ${assignment.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create assignment "${assignment.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating assignment:', error);
                }
            }

            // Create evaluations (only future exams/tests/quizzes)
            for (const evaluation of extracted.evaluations) {
                try {
                    // Only process exams, tests, and quizzes (exclude reports, presentations, projects)
                    if (!['exam', 'test', 'quiz'].includes(evaluation.type)) {
                        console.log(`[GmailSync] Skipping non-exam evaluation: ${evaluation.title} (type: ${evaluation.type})`);
                        continue;
                    }

                    // Validate date is in the future
                    const evalDate = new Date(evaluation.date);
                    if (evalDate <= now) {
                        console.log(`[GmailSync] Skipping past evaluation: ${evaluation.title} (date: ${evaluation.date})`);
                        continue;
                    }

                    // Check if already exists
                    const existing = await db.select()
                        .from(studentEvaluations)
                        .where(
                            and(
                                eq(studentEvaluations.userId, userId),
                                eq(studentEvaluations.sourceType, 'gmail'),
                                eq(studentEvaluations.sourceId, evaluation.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Evaluation already exists: ${evaluation.title}`);
                        continue;
                    }

                    // Match courseCode to get courseId
                    const matchedCourse = enrolledCourses.find(
                        ec => ec.course.code?.toLowerCase() === evaluation.courseCode?.toLowerCase()
                    );
                    const courseId = matchedCourse?.course.id || null;

                    if (courseId) {
                        console.log(`[GmailSync] Matched evaluation to course: ${evaluation.courseCode} -> ${courseId}`);
                    } else {
                        console.log(`[GmailSync] Could not match course code: ${evaluation.courseCode}`);
                    }

                    await db.insert(studentEvaluations).values({
                        userId,
                        courseId,
                        courseCode: evaluation.courseCode,
                        courseName: evaluation.courseName,
                        title: evaluation.title,
                        type: evaluation.type,
                        date: new Date(evaluation.date),
                        duration: evaluation.duration || null,
                        location: evaluation.location || null,
                        description: evaluation.description || null,
                        sourceType: 'gmail',
                        sourceId: evaluation.emailId,
                    });

                    result.evaluationsCreated++;
                    console.log(`[GmailSync] Created evaluation: ${evaluation.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create evaluation "${evaluation.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating evaluation:', error);
                }
            }

            // Create campus events (only future ones)
            for (const event of extracted.events) {
                try {
                    // Validate date is in the future
                    const eventDate = new Date(event.date);
                    if (eventDate <= now) {
                        console.log(`[GmailSync] Skipping past event: ${event.title} (date: ${event.date})`);
                        continue;
                    }

                    // Check if already exists
                    const existing = await db.select()
                        .from(campusEvents)
                        .where(
                            and(
                                eq(campusEvents.userId, userId),
                                eq(campusEvents.sourceType, 'gmail'),
                                eq(campusEvents.sourceId, event.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Event already exists: ${event.title}`);
                        continue;
                    }

                    await db.insert(campusEvents).values({
                        userId,
                        title: event.title,
                        type: event.type,
                        description: event.description || null,
                        organizer: event.organizer || null,
                        date: new Date(event.date),
                        endDate: event.endDate ? new Date(event.endDate) : null,
                        registrationDeadline: event.registrationDeadline ? new Date(event.registrationDeadline) : null,
                        location: event.location || null,
                        websiteUrl: event.websiteUrl || null,
                        registrationUrl: event.registrationUrl || null,
                        prizePool: event.prizePool || null,
                        eligibility: event.eligibility || null,
                        sourceType: 'gmail',
                        sourceId: event.emailId,
                    });

                    result.eventsCreated++;
                    console.log(`[GmailSync] Created event: ${event.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create event "${event.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating event:', error);
                }
            }

            // Update sync state with the most recent email timestamp
            if (allEmails.length > 0) {
                const latestEmailTimestamp = Math.max(...allEmails.map(e => parseInt(e.internalDate || '0'))).toString();
                await this.updateSyncState(userId, latestEmailTimestamp);
                console.log(`[GmailSync] Updated sync state: ${latestEmailTimestamp}`);
            }

            console.log(`[GmailSync] Sync complete: ${result.assignmentsCreated} assignments, ${result.evaluationsCreated} evaluations, ${result.eventsCreated} events created`);

        } catch (error: any) {
            result.success = false;
            result.errors.push(`Sync failed: ${error.message}`);
            console.error('[GmailSync] Sync error:', error);
        }

        return result;
    }

    /**
     * Force full sync from Gmail (ignores last sync timestamp)
     * Reprocesses last 90 days of emails
     */
    async forceSyncFromGmail(userId: string): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            emailsAnalyzed: 0,
            emailsSkipped: 0,
            assignmentsCreated: 0,
            evaluationsCreated: 0,
            eventsCreated: 0,
            errors: [],
        };

        try {
            console.log('[GmailSync] Starting FORCE SYNC (ignoring last sync timestamp)');

            // Fetch emails from last 90 days, ignoring last sync timestamp
            const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
            console.log('[GmailSync] Fetching emails from last 90 days...');

            const allEmails = await this.fetchEmails(userId, ninetyDaysAgo.toString());

            if (allEmails.length === 0) {
                console.log('[GmailSync] No emails found in last 90 days');
                return result;
            }

            console.log(`[GmailSync] Fetched ${allEmails.length} emails from last 90 days`);

            // Filter out already-processed emails to save AI tokens
            const emails = await this.filterUnprocessedEmails(allEmails, userId);
            result.emailsAnalyzed = emails.length;
            result.emailsSkipped = allEmails.length - emails.length;

            if (emails.length === 0) {
                console.log('[GmailSync] All emails already processed');
                return result;
            }

            console.log(`[GmailSync] Analyzing ${emails.length} new emails with AI...`);

            // Analyze with AI (pass userId for course context)
            const extracted = await this.analyzeEmailsWithAI(emails, userId);

            console.log(`[GmailSync] AI extracted: ${extracted.assignments.length} assignments, ${extracted.evaluations.length} evaluations, ${extracted.events.length} events`);

            // Create assignments (only future ones)
            const now = new Date();
            const enrolledCourses = await academicsService.getUserCourses(userId);

            for (const assignment of extracted.assignments) {
                try {
                    // Validate due date is in the future
                    const dueDate = new Date(assignment.dueDate);
                    if (dueDate <= now) {
                        console.log(`[GmailSync] Skipping past assignment: ${assignment.title} (due: ${assignment.dueDate})`);
                        continue;
                    }

                    // Check if already exists (by source_id)
                    const existing = await db.select()
                        .from(studentAssignments)
                        .where(
                            and(
                                eq(studentAssignments.userId, userId),
                                eq(studentAssignments.sourceType, 'gmail'),
                                eq(studentAssignments.sourceId, assignment.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Assignment already exists: ${assignment.title}`);
                        continue;
                    }

                    // Match courseCode to get courseId
                    const matchedCourse = enrolledCourses.find(
                        ec => ec.course.code?.toLowerCase() === assignment.courseCode?.toLowerCase()
                    );
                    const courseId = matchedCourse?.course.id || null;

                    if (courseId) {
                        console.log(`[GmailSync] Matched assignment to course: ${assignment.courseCode} -> ${courseId}`);
                    } else {
                        console.log(`[GmailSync] Could not match course code: ${assignment.courseCode}`);
                    }

                    await db.insert(studentAssignments).values({
                        userId,
                        courseId,
                        courseCode: assignment.courseCode,
                        courseName: assignment.courseName,
                        title: assignment.title,
                        description: assignment.description,
                        dueDate: new Date(assignment.dueDate),
                        priority: assignment.priority,
                        status: 'not_started',
                        sourceType: 'gmail',
                        sourceId: assignment.emailId,
                    });

                    result.assignmentsCreated++;
                    console.log(`[GmailSync] Created assignment: ${assignment.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create assignment "${assignment.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating assignment:', error);
                }
            }

            // Create evaluations (only future exams/tests/quizzes)
            for (const evaluation of extracted.evaluations) {
                try {
                    // Only process exams, tests, and quizzes (exclude reports, presentations, projects)
                    if (!['exam', 'test', 'quiz'].includes(evaluation.type)) {
                        console.log(`[GmailSync] Skipping non-exam evaluation: ${evaluation.title} (type: ${evaluation.type})`);
                        continue;
                    }

                    // Validate date is in the future
                    const evalDate = new Date(evaluation.date);
                    if (evalDate <= now) {
                        console.log(`[GmailSync] Skipping past evaluation: ${evaluation.title} (date: ${evaluation.date})`);
                        continue;
                    }

                    // Check if already exists
                    const existing = await db.select()
                        .from(studentEvaluations)
                        .where(
                            and(
                                eq(studentEvaluations.userId, userId),
                                eq(studentEvaluations.sourceType, 'gmail'),
                                eq(studentEvaluations.sourceId, evaluation.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Evaluation already exists: ${evaluation.title}`);
                        continue;
                    }

                    // Match courseCode to get courseId
                    const matchedCourse = enrolledCourses.find(
                        ec => ec.course.code?.toLowerCase() === evaluation.courseCode?.toLowerCase()
                    );
                    const courseId = matchedCourse?.course.id || null;

                    if (courseId) {
                        console.log(`[GmailSync] Matched evaluation to course: ${evaluation.courseCode} -> ${courseId}`);
                    } else {
                        console.log(`[GmailSync] Could not match course code: ${evaluation.courseCode}`);
                    }

                    await db.insert(studentEvaluations).values({
                        userId,
                        courseId,
                        courseCode: evaluation.courseCode,
                        courseName: evaluation.courseName,
                        title: evaluation.title,
                        type: evaluation.type,
                        date: new Date(evaluation.date),
                        duration: evaluation.duration || null,
                        location: evaluation.location || null,
                        description: evaluation.description || null,
                        sourceType: 'gmail',
                        sourceId: evaluation.emailId,
                    });

                    result.evaluationsCreated++;
                    console.log(`[GmailSync] Created evaluation: ${evaluation.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create evaluation "${evaluation.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating evaluation:', error);
                }
            }

            // Create campus events (only future ones)
            for (const event of extracted.events) {
                try {
                    // Validate date is in the future
                    const eventDate = new Date(event.date);
                    if (eventDate <= now) {
                        console.log(`[GmailSync] Skipping past event: ${event.title} (date: ${event.date})`);
                        continue;
                    }

                    // Check if already exists
                    const existing = await db.select()
                        .from(campusEvents)
                        .where(
                            and(
                                eq(campusEvents.userId, userId),
                                eq(campusEvents.sourceType, 'gmail'),
                                eq(campusEvents.sourceId, event.emailId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[GmailSync] Event already exists: ${event.title}`);
                        continue;
                    }

                    await db.insert(campusEvents).values({
                        userId,
                        title: event.title,
                        type: event.type,
                        description: event.description || null,
                        organizer: event.organizer || null,
                        date: new Date(event.date),
                        endDate: event.endDate ? new Date(event.endDate) : null,
                        registrationDeadline: event.registrationDeadline ? new Date(event.registrationDeadline) : null,
                        location: event.location || null,
                        websiteUrl: event.websiteUrl || null,
                        registrationUrl: event.registrationUrl || null,
                        prizePool: event.prizePool || null,
                        eligibility: event.eligibility || null,
                        sourceType: 'gmail',
                        sourceId: event.emailId,
                    });

                    result.eventsCreated++;
                    console.log(`[GmailSync] Created event: ${event.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create event "${event.title}": ${error.message}`);
                    console.error('[GmailSync] Error creating event:', error);
                }
            }

            // Update sync state with current timestamp (last 90 days)
            if (allEmails.length > 0) {
                const latestEmailTimestamp = Math.max(...allEmails.map(e => parseInt(e.internalDate || '0'))).toString();
                await this.updateSyncState(userId, latestEmailTimestamp);
                console.log(`[GmailSync] Updated sync state: ${latestEmailTimestamp}`);
            }

            console.log(`[GmailSync] Force sync complete: ${result.assignmentsCreated} assignments, ${result.evaluationsCreated} evaluations, ${result.eventsCreated} events created`);

        } catch (error: any) {
            result.success = false;
            result.errors.push(`Force sync failed: ${error.message}`);
            console.error('[GmailSync] Force sync error:', error);
        }

        return result;
    }
}

export const gmailSyncService = new GmailSyncService();

import { google } from 'googleapis';
import { db } from '../../core/database/client';
import { studentAssignments, studentEvaluations, syncState } from './student-profile.schema';
import { getAuthenticatedClient } from '../gmail-auth/gmail-auth.service';
import { eq, and } from 'drizzle-orm';

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

interface SyncResult {
    success: boolean;
    emailsAnalyzed: number;
    assignmentsCreated: number;
    evaluationsCreated: number;
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
     * Analyze emails with AI and extract structured data
     */
    private async analyzeEmailsWithAI(emails: any[]): Promise<{
        assignments: ExtractedAssignment[];
        evaluations: ExtractedEvaluation[];
    }> {
        if (emails.length === 0) {
            return { assignments: [], evaluations: [] };
        }

        // Prepare email text for AI analysis
        const emailText = emails.map((e, i) => {
            return `${i + 1}. Subject: ${e.subject} | From: ${e.from} | Date: ${e.date} | Body: ${e.body} | ID:${e.id}`;
        }).join('\n');

        // Use Groq for fast, cheap analysis
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        if (!GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not configured');
        }

        const systemPrompt = `You are an AI assistant that analyzes Gmail emails and extracts assignments and evaluations.

IMPORTANT INSTRUCTIONS:
1. Extract ONLY assignments and evaluations from the emails
2. Look for emails from professors, TAs, course management systems (Moodle, Canvas, etc.)
3. For assignments: Look for keywords like "assignment", "homework", "lab", "problem set", "due", "submit"
4. For evaluations: Look for keywords like "quiz", "exam", "test", "midterm", "final", "evaluation"
5. Ignore promotional emails, newsletters, social notifications
6. Determine priority based on:
   - high: Due within 24 hours, or marked as "urgent"
   - medium: Due within 7 days
   - low: Due after 7 days
7. Extract course codes (e.g., "CS F111", "MATH F112") from subject or body
8. Extract due dates/exam dates - be precise with date/time
9. Return ONLY valid JSON, no markdown, no explanations

Return format:
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
  ]
}

If no assignments or evaluations found, return empty arrays.
Type must be one of: quiz, exam, report, presentation, project`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Analyze these Gmail emails and extract assignments and evaluations:\n\n${emailText}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        try {
            const parsed = JSON.parse(content);
            return {
                assignments: parsed.assignments || [],
                evaluations: parsed.evaluations || [],
            };
        } catch (error) {
            console.error('[GmailSync] Failed to parse AI response:', content);
            return { assignments: [], evaluations: [] };
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
            assignmentsCreated: 0,
            evaluationsCreated: 0,
            errors: [],
        };

        try {
            // Get last sync state
            const state = await this.getSyncState(userId);
            console.log('[GmailSync] Last sync timestamp:', state.lastEmailTimestamp);

            // Fetch emails
            console.log('[GmailSync] Fetching emails...');
            const emails = await this.fetchEmails(userId, state.lastEmailTimestamp);
            result.emailsAnalyzed = emails.length;

            if (emails.length === 0) {
                console.log('[GmailSync] No new emails found');
                return result;
            }

            console.log(`[GmailSync] Analyzing ${emails.length} emails with AI...`);

            // Analyze with AI
            const extracted = await this.analyzeEmailsWithAI(emails);

            console.log(`[GmailSync] AI extracted: ${extracted.assignments.length} assignments, ${extracted.evaluations.length} evaluations`);

            // Create assignments
            for (const assignment of extracted.assignments) {
                try {
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

                    await db.insert(studentAssignments).values({
                        userId,
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

            // Create evaluations
            for (const evaluation of extracted.evaluations) {
                try {
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

                    await db.insert(studentEvaluations).values({
                        userId,
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

            // Update sync state with the most recent email timestamp
            if (emails.length > 0) {
                const latestEmailTimestamp = Math.max(...emails.map(e => parseInt(e.internalDate || '0'))).toString();
                await this.updateSyncState(userId, latestEmailTimestamp);
                console.log(`[GmailSync] Updated sync state: ${latestEmailTimestamp}`);
            }

            console.log(`[GmailSync] Sync complete: ${result.assignmentsCreated} assignments, ${result.evaluationsCreated} evaluations created`);

        } catch (error: any) {
            result.success = false;
            result.errors.push(`Sync failed: ${error.message}`);
            console.error('[GmailSync] Sync error:', error);
        }

        return result;
    }
}

export const gmailSyncService = new GmailSyncService();

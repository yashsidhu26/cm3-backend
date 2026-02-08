import { db } from '../../core/database/client';
import { studentAssignments, studentEvaluations, syncState } from './student-profile.schema';
import { moodleClient } from '../academics/moodle.service';
import * as moodleAuth from '../academics/moodle-auth.service';
import { eq, and, gt } from 'drizzle-orm';
import { VertexAI } from '@google-cloud/vertexai';

/**
 * Moodle Auto-Sync Service
 * Analyzes Moodle notifications and extracts assignments/evaluations using AI
 */

interface ExtractedAssignment {
    courseCode: string;
    courseName: string;
    title: string;
    description: string;
    dueDate: string; // ISO string
    priority: 'low' | 'medium' | 'high';
    notificationId?: string;
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
    notificationId?: string;
}

interface SyncResult {
    success: boolean;
    assignmentsCreated: number;
    evaluationsCreated: number;
    errors: string[];
    notificationsAnalyzed: number;
}

export class MoodleSyncService {

    /**
     * Get or create sync state for Moodle
     */
    private async getSyncState(userId: string): Promise<{ lastNotificationId?: string }> {
        const [state] = await db.select()
            .from(syncState)
            .where(and(
                eq(syncState.userId, userId),
                eq(syncState.source, 'moodle')
            ))
            .limit(1);

        return {
            lastNotificationId: state?.lastNotificationId || undefined,
        };
    }

    /**
     * Update sync state for Moodle
     */
    private async updateSyncState(userId: string, lastNotificationId: string): Promise<void> {
        const existing = await db.select()
            .from(syncState)
            .where(and(
                eq(syncState.userId, userId),
                eq(syncState.source, 'moodle')
            ))
            .limit(1);

        if (existing.length > 0) {
            await db.update(syncState)
                .set({
                    lastNotificationId,
                    lastSyncAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(syncState.userId, userId),
                    eq(syncState.source, 'moodle')
                ));
        } else {
            await db.insert(syncState).values({
                userId,
                source: 'moodle',
                lastNotificationId,
                lastSyncAt: new Date(),
            });
        }
    }

    /**
     * Analyze notifications with AI and extract structured data
     */
    private async analyzeNotificationsWithAI(notifications: any[]): Promise<{
        assignments: ExtractedAssignment[];
        evaluations: ExtractedEvaluation[];
    }> {
        if (notifications.length === 0) {
            return { assignments: [], evaluations: [] };
        }

        // Prepare notification text for AI analysis (concise format to save tokens)
        const notificationText = notifications.map((n, i) => {
            const message = (n.fullmessage || n.smallmessage || '').substring(0, 300); // Limit message length
            const time = n.timecreated ? new Date(n.timecreated * 1000).toISOString() : 'Unknown';
            return `${i + 1}. ${n.subject} | ${message} | ${time} | ID:${n.id}`;
        }).join('\n');

        // Use Gemini for analysis
        const projectId = process.env.GCP_PROJECT_ID;
        const location = 'global';
        const apiEndpoint = 'aiplatform.googleapis.com';

        if (!projectId) {
            throw new Error('GCP_PROJECT_ID not configured');
        }

        const systemPrompt = `You are an AI assistant that analyzes Moodle notifications and extracts assignments and evaluations.

IMPORTANT INSTRUCTIONS:
1. Extract ONLY assignments and evaluations from the notifications
2. For assignments: Look for keywords like "assignment", "homework", "lab", "problem set", "due"
3. For evaluations: Look for keywords like "quiz", "exam", "test", "midterm", "final"
4. Determine priority based on:
   - high: Due within 24 hours, or marked as "urgent"
   - medium: Due within 7 days
   - low: Due after 7 days
5. Extract course codes (e.g., "CS F111", "MATH F112") from the notification
6. Extract due dates/exam dates - be precise with date/time
7. Return ONLY valid JSON, no markdown, no explanations

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
      "notificationId": "123"
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
      "notificationId": "124"
    }
  ]
}

If no assignments or evaluations found, return empty arrays.
Type must be one of: quiz, exam, report, presentation, project`;

        console.log(`[MoodleSync] Analyzing ${notifications.length} notifications with Gemini...`);

        try {
            const vertexAI = new VertexAI({ project: projectId, location, apiEndpoint });
            const model = vertexAI.getGenerativeModel({
                model: 'gemini-2.5-flash-lite',
            });

            const userPrompt = `Analyze these Moodle notifications and extract assignments and evaluations:\n\n${notificationText}`;

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
                    maxOutputTokens: 3000,
                    responseMimeType: 'application/json',
                }
            });

            const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) {
                console.error('[MoodleSync] Empty response from Gemini');
                return { assignments: [], evaluations: [] };
            }

            const parsed = JSON.parse(responseText);
            console.log(`[MoodleSync] Extracted: ${parsed.assignments?.length || 0} assignments, ${parsed.evaluations?.length || 0} evaluations`);

            return {
                assignments: parsed.assignments || [],
                evaluations: parsed.evaluations || [],
            };
        } catch (error: any) {
            console.error('[MoodleSync] Gemini analysis failed:', error.message);
            return { assignments: [], evaluations: [] };
        }
    }

    /**
     * Sync assignments and evaluations from Moodle notifications
     */
    async syncFromMoodle(userId: string): Promise<SyncResult> {
        const result: SyncResult = {
            success: true,
            assignmentsCreated: 0,
            evaluationsCreated: 0,
            errors: [],
            notificationsAnalyzed: 0,
        };

        try {
            // Get Moodle credentials
            const token = await moodleAuth.getMoodleToken(userId);
            if (!token) {
                result.success = false;
                result.errors.push('Moodle not connected. Please sign in via Moodle first.');
                return result;
            }

            const moodleUserId = await moodleAuth.getMoodleUserId(userId);
            if (!moodleUserId) {
                result.success = false;
                result.errors.push('Moodle user ID not found');
                return result;
            }

            // Get last sync state
            const state = await this.getSyncState(userId);
            const lastNotificationId = state.lastNotificationId ? parseInt(state.lastNotificationId) : 0;
            console.log('[MoodleSync] Last synced notification ID:', lastNotificationId);

            // Fetch notifications
            console.log('[MoodleSync] Fetching notifications...');
            const allNotifications = await moodleClient.fetchNotifications(token, moodleUserId);

            if (allNotifications.length === 0) {
                console.log('[MoodleSync] No notifications found');
                return result;
            }

            // Filter to only new notifications (ID greater than last synced)
            const newNotifications = allNotifications.filter(n => (n.id || 0) > lastNotificationId);

            if (newNotifications.length === 0) {
                console.log('[MoodleSync] No new notifications since last sync');
                return result;
            }

            // Limit to most recent 30 notifications to stay within token limits
            // Sort by timecreated descending (most recent first)
            const recentNotifications = newNotifications
                .sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0))
                .slice(0, 30);

            result.notificationsAnalyzed = recentNotifications.length;
            console.log(`[MoodleSync] Processing ${recentNotifications.length} new notifications (${allNotifications.length} total, ${lastNotificationId} already synced)...`);

            // Analyze with AI
            const extracted = await this.analyzeNotificationsWithAI(recentNotifications);

            console.log(`[MoodleSync] AI extracted: ${extracted.assignments.length} assignments, ${extracted.evaluations.length} evaluations`);

            // Create assignments
            for (const assignment of extracted.assignments) {
                try {
                    // Check if already exists (by source_id)
                    const existing = await db.select()
                        .from(studentAssignments)
                        .where(
                            and(
                                eq(studentAssignments.userId, userId),
                                eq(studentAssignments.sourceType, 'moodle'),
                                eq(studentAssignments.sourceId, assignment.notificationId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[MoodleSync] Assignment already exists: ${assignment.title}`);
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
                        notificationId: assignment.notificationId,
                        sourceType: 'moodle',
                        sourceId: assignment.notificationId,
                    });

                    result.assignmentsCreated++;
                    console.log(`[MoodleSync] Created assignment: ${assignment.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create assignment "${assignment.title}": ${error.message}`);
                    console.error('[MoodleSync] Error creating assignment:', error);
                }
            }

            // Create evaluations
            for (const evaluation of extracted.evaluations) {
                try {
                    // Check if already exists (by source_id)
                    const existing = await db.select()
                        .from(studentEvaluations)
                        .where(
                            and(
                                eq(studentEvaluations.userId, userId),
                                eq(studentEvaluations.sourceType, 'moodle'),
                                eq(studentEvaluations.sourceId, evaluation.notificationId || '')
                            )
                        )
                        .limit(1);

                    if (existing.length > 0) {
                        console.log(`[MoodleSync] Evaluation already exists: ${evaluation.title}`);
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
                        notificationId: evaluation.notificationId,
                        sourceType: 'moodle',
                        sourceId: evaluation.notificationId,
                    });

                    result.evaluationsCreated++;
                    console.log(`[MoodleSync] Created evaluation: ${evaluation.title}`);
                } catch (error: any) {
                    result.errors.push(`Failed to create evaluation "${evaluation.title}": ${error.message}`);
                    console.error('[MoodleSync] Error creating evaluation:', error);
                }
            }

            // Update sync state with the highest notification ID processed
            if (recentNotifications.length > 0) {
                const latestNotificationId = Math.max(...recentNotifications.map(n => n.id || 0)).toString();
                await this.updateSyncState(userId, latestNotificationId);
                console.log(`[MoodleSync] Updated sync state: ${latestNotificationId}`);
            }

            console.log(`[MoodleSync] Sync complete: ${result.assignmentsCreated} assignments, ${result.evaluationsCreated} evaluations created`);

        } catch (error: any) {
            result.success = false;
            result.errors.push(`Sync failed: ${error.message}`);
            console.error('[MoodleSync] Sync error:', error);
        }

        return result;
    }
}

export const moodleSyncService = new MoodleSyncService();

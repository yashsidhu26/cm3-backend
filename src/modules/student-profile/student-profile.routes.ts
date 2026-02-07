import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { studentProfileService } from './student-profile.service';
import { moodleSyncService } from './moodle-sync.service';
import { gmailSyncService } from './gmail-sync.service';
import { db } from '../../core/database/client';
import { activityLogs, studentAssignments, studentEvaluations, syncState } from './student-profile.schema';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { eq, and, gte, desc } from 'drizzle-orm';

// Background sync tracking
const runningSyncs = new Map<string, Promise<any>>();

/**
 * Helper: Check if sync is needed (> 6 hours since last sync)
 */
async function shouldSync(userId: string): Promise<boolean> {
    try {
        const [moodleState, gmailState] = await Promise.all([
            db.select().from(syncState).where(and(eq(syncState.userId, userId), eq(syncState.source, 'moodle'))).limit(1),
            db.select().from(syncState).where(and(eq(syncState.userId, userId), eq(syncState.source, 'gmail'))).limit(1),
        ]);

        const SIX_HOURS = 6 * 60 * 60 * 1000;
        const now = Date.now();

        const moodleNeedsSync = !moodleState[0] || (now - moodleState[0].lastSyncAt.getTime()) > SIX_HOURS;
        const gmailNeedsSync = !gmailState[0] || (now - gmailState[0].lastSyncAt.getTime()) > SIX_HOURS;

        return moodleNeedsSync || gmailNeedsSync;
    } catch (error) {
        console.error('[SyncCheck] Error checking sync state:', error);
        return false;
    }
}

/**
 * Helper: Trigger background sync (non-blocking)
 */
function triggerBackgroundSync(userId: string): void {
    // Check if already syncing
    if (runningSyncs.has(userId)) {
        console.log(`[BackgroundSync] Already running for user ${userId}`);
        return;
    }

    // Start sync in background
    const syncPromise = (async () => {
        try {
            console.log(`[BackgroundSync] Starting for user ${userId}`);

            const [moodleResult, gmailResult] = await Promise.allSettled([
                moodleSyncService.syncFromMoodle(userId),
                gmailSyncService.syncFromGmail(userId),
            ]);

            console.log(`[BackgroundSync] Completed for user ${userId}`);
            console.log(`  Moodle: ${moodleResult.status === 'fulfilled' ? moodleResult.value.assignmentsCreated : 0} assignments`);
            console.log(`  Gmail: ${gmailResult.status === 'fulfilled' ? gmailResult.value.assignmentsCreated : 0} assignments`);
        } catch (error) {
            console.error(`[BackgroundSync] Error for user ${userId}:`, error);
        } finally {
            runningSyncs.delete(userId);
        }
    })();

    runningSyncs.set(userId, syncPromise);
}

const app = new Hono();

/**
 * Student Profile Routes
 * Base path: /api/student-profile (determined by directory name)
 * Note: Directory name is 'student-profile', so app.ts mounts at /api/student-profile
 */

// Schema for Profile Upsert
const profileSchema = z.object({
    userId: z.string().uuid(),
    learningStyle: z.enum(['visual', 'auditory', 'kinesthetic', 'hybrid']).optional(),
    bio: z.string().optional(),
});

// Schema for Academics Upsert
const academicSchema = z.object({
    userId: z.string().uuid(),
    gpa: z.number().optional(),
    major: z.string().optional(),
    skills: z.array(z.string()),
    interests: z.array(z.string()),
});

// Schema for Activity Log
const logSchema = z.object({
    userId: z.string().uuid(),
    taskId: z.string().uuid().optional(),
    scheduledTime: z.string().datetime(), // ISO string
    completionTime: z.string().datetime().optional(),
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['completed', 'pending', 'skipped']),
});

/**
 * POST /profile
 * Update student profile info
 */
app.post('/profile', zValidator('json', profileSchema), async (c) => {
    const data = c.req.valid('json');
    const result = await studentProfileService.upsertProfile(data.userId, {
        userId: data.userId,
        learningStyle: data.learningStyle,
        bio: data.bio
    });
    return c.json(result);
});

/**
 * POST /academics
 * Update academic info (Skills, Interests)
 */
app.post('/academics', zValidator('json', academicSchema), async (c) => {
    const data = c.req.valid('json');
    const result = await studentProfileService.upsertAcademics(data.userId, {
        gpa: data.gpa?.toString(),
        major: data.major,
        skills: data.skills,
        interests: data.interests
    });
    return c.json(result);
});

/**
 * POST /log-activity
 * Record an activity for behavioral analysis
 */
app.post('/log-activity', zValidator('json', logSchema), async (c) => {
    const data = c.req.valid('json');
    const result = await db.insert(activityLogs).values({
        userId: data.userId,
        taskId: data.taskId,
        scheduledTime: new Date(data.scheduledTime),
        completionTime: data.completionTime ? new Date(data.completionTime) : null,
        priority: data.priority,
        status: data.status,
    }).returning();
    return c.json(result[0]);
});

/**
 * GET /dashboard/:userId
 * Get full dashboard with insights
 */
app.get('/dashboard/:userId', async (c) => {
    const userId = c.req.param('userId');
    const data = await studentProfileService.getDashboardData(userId);
    return c.json(data);
});

/**
 * GET /student/:userId/smart-plan
 * Get personalized study plan
 */
app.get('/student/:userId/smart-plan', async (c) => {
    const userId = c.req.param('userId');
    const plan = await studentProfileService.getSmartStudyPlan(userId);
    return c.json(plan);
});

// ============================================
// FOCUS SCREEN ENDPOINTS
// ============================================

/**
 * GET /focus-data
 * Get all data needed for the Focus screen (authenticated)
 * LEGACY: Use split endpoints below for better performance
 */
app.get('/focus-data', protect, async (c) => {
    try {
        const user = c.get('user');
        const focusData = await studentProfileService.getFocusScreenData(user.id);
        return successResponse(c, focusData);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch focus data', 500);
    }
});

// ============================================
// SPLIT DATA ENDPOINTS (Performance Optimized)
// ============================================

/**
 * GET /assignments/upcoming
 * Get upcoming assignments with optional auto-sync
 * Returns cached data immediately, syncs in background if needed
 */
app.get('/assignments/upcoming', protect, async (c) => {
    try {
        const user = c.get('user');
        const limit = parseInt(c.req.query('limit') || '20');
        const autoSync = c.req.query('autoSync') !== 'false'; // Default true

        // Check if sync is needed
        if (autoSync && await shouldSync(user.id)) {
            // Trigger background sync (non-blocking)
            triggerBackgroundSync(user.id);
        }

        // Return cached data immediately
        const now = new Date();
        const assignments = await db.select()
            .from(studentAssignments)
            .where(and(
                eq(studentAssignments.userId, user.id),
                gte(studentAssignments.dueDate, now)
            ))
            .orderBy(studentAssignments.dueDate)
            .limit(limit);

        return successResponse(c, {
            assignments: assignments.map(a => ({
                id: a.id,
                course: a.courseCode || a.courseName || 'Unknown',
                courseCode: a.courseCode,
                courseName: a.courseName,
                title: a.title,
                description: a.description,
                due: a.dueDate.toISOString(),
                priority: a.priority,
                status: a.status,
                source: a.sourceType,
            })),
            count: assignments.length,
            syncing: runningSyncs.has(user.id),
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch assignments', 500);
    }
});

/**
 * GET /evaluations/upcoming
 * Get upcoming evaluations with optional auto-sync
 * Returns cached data immediately, syncs in background if needed
 */
app.get('/evaluations/upcoming', protect, async (c) => {
    try {
        const user = c.get('user');
        const limit = parseInt(c.req.query('limit') || '20');
        const autoSync = c.req.query('autoSync') !== 'false'; // Default true

        // Check if sync is needed
        if (autoSync && await shouldSync(user.id)) {
            // Trigger background sync (non-blocking)
            triggerBackgroundSync(user.id);
        }

        // Return cached data immediately
        const now = new Date();
        const evaluations = await db.select()
            .from(studentEvaluations)
            .where(and(
                eq(studentEvaluations.userId, user.id),
                gte(studentEvaluations.date, now)
            ))
            .orderBy(studentEvaluations.date)
            .limit(limit);

        return successResponse(c, {
            evaluations: evaluations.map(e => ({
                id: e.id,
                course: e.courseCode || e.courseName || 'Unknown',
                courseCode: e.courseCode,
                courseName: e.courseName,
                title: e.title,
                type: e.type,
                date: e.date.toISOString(),
                duration: e.duration,
                location: e.location,
                description: e.description,
                source: e.sourceType,
            })),
            count: evaluations.length,
            syncing: runningSyncs.has(user.id),
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch evaluations', 500);
    }
});

/**
 * GET /ai-tips
 * Get AI-generated tips based on current assignments and evaluations
 * Fast endpoint - no sync needed
 */
app.get('/ai-tips', protect, async (c) => {
    try {
        const user = c.get('user');

        // Get upcoming assignments and evaluations
        const now = new Date();
        const [assignments, evaluations] = await Promise.all([
            db.select()
                .from(studentAssignments)
                .where(and(eq(studentAssignments.userId, user.id), gte(studentAssignments.dueDate, now)))
                .orderBy(studentAssignments.dueDate)
                .limit(10),
            db.select()
                .from(studentEvaluations)
                .where(and(eq(studentEvaluations.userId, user.id), gte(studentEvaluations.date, now)))
                .orderBy(studentEvaluations.date)
                .limit(10),
        ]);

        // Generate AI tips (from service)
        const tips = studentProfileService['generateAiTips'](assignments, evaluations);

        return successResponse(c, {
            tips,
            basedOn: {
                assignments: assignments.length,
                evaluations: evaluations.length,
            },
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to generate AI tips', 500);
    }
});

/**
 * GET /sync-status
 * Check if sync is needed or currently running
 */
app.get('/sync-status', protect, async (c) => {
    try {
        const user = c.get('user');

        const [moodleState, gmailState] = await Promise.all([
            db.select().from(syncState).where(and(eq(syncState.userId, user.id), eq(syncState.source, 'moodle'))).limit(1),
            db.select().from(syncState).where(and(eq(syncState.userId, user.id), eq(syncState.source, 'gmail'))).limit(1),
        ]);

        const now = Date.now();
        const SIX_HOURS = 6 * 60 * 60 * 1000;

        const moodleLastSync = moodleState[0]?.lastSyncAt;
        const gmailLastSync = gmailState[0]?.lastSyncAt;

        return successResponse(c, {
            syncing: runningSyncs.has(user.id),
            syncNeeded: await shouldSync(user.id),
            lastSync: {
                moodle: moodleLastSync ? {
                    timestamp: moodleLastSync.toISOString(),
                    hoursAgo: (now - moodleLastSync.getTime()) / (1000 * 60 * 60),
                } : null,
                gmail: gmailLastSync ? {
                    timestamp: gmailLastSync.toISOString(),
                    hoursAgo: (now - gmailLastSync.getTime()) / (1000 * 60 * 60),
                } : null,
            },
            recommendation: await shouldSync(user.id) ? 'Sync recommended' : 'Data is up to date',
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to check sync status', 500);
    }
});

/**
 * POST /sync-background
 * Trigger background sync (non-blocking)
 * Returns immediately, sync runs in background
 */
app.post('/sync-background', protect, async (c) => {
    try {
        const user = c.get('user');

        // Check if already syncing
        if (runningSyncs.has(user.id)) {
            return successResponse(c, {
                message: 'Sync already in progress',
                syncing: true,
            });
        }

        // Trigger background sync
        triggerBackgroundSync(user.id);

        return successResponse(c, {
            message: 'Background sync started',
            syncing: true,
        }, 202); // 202 Accepted
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to trigger sync', 500);
    }
});

// ============================================
// ASSIGNMENTS ENDPOINTS (CRUD)
// ============================================

const assignmentCreateSchema = z.object({
    courseId: z.string().uuid().optional(),
    courseCode: z.string().max(50).optional(),
    courseName: z.string().max(255).optional(),
    title: z.string().max(255),
    description: z.string().optional(),
    dueDate: z.string().datetime(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    status: z.enum(['not_started', 'in_progress', 'submitted', 'graded']).default('not_started'),
});

const assignmentUpdateSchema = assignmentCreateSchema.partial();

/**
 * GET /assignments
 * Get all assignments for authenticated user
 */
app.get('/assignments', protect, async (c) => {
    try {
        const user = c.get('user');
        const limit = parseInt(c.req.query('limit') || '20');
        const upcoming = c.req.query('upcoming') === 'true'; // Only upcoming assignments

        let query = db.select()
            .from(studentAssignments)
            .where(eq(studentAssignments.userId, user.id))
            .orderBy(studentAssignments.dueDate)
            .limit(limit);

        if (upcoming) {
            query = db.select()
                .from(studentAssignments)
                .where(
                    and(
                        eq(studentAssignments.userId, user.id),
                        gte(studentAssignments.dueDate, new Date())
                    )
                )
                .orderBy(studentAssignments.dueDate)
                .limit(limit);
        }

        const assignments = await query;

        return successResponse(c, {
            assignments,
            count: assignments.length,
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch assignments', 500);
    }
});

/**
 * POST /assignments
 * Create a new assignment (authenticated)
 */
app.post('/assignments', protect, zValidator('json', assignmentCreateSchema), async (c) => {
    try {
        const user = c.get('user');
        const data = c.req.valid('json');

        const [assignment] = await db.insert(studentAssignments).values({
            userId: user.id,
            courseId: data.courseId,
            courseCode: data.courseCode,
            courseName: data.courseName,
            title: data.title,
            description: data.description,
            dueDate: new Date(data.dueDate),
            priority: data.priority,
            status: data.status,
        }).returning();

        return successResponse(c, assignment, 201);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to create assignment', 500);
    }
});

/**
 * PUT /assignments/:id
 * Update an assignment (authenticated)
 */
app.put('/assignments/:id', protect, zValidator('json', assignmentUpdateSchema), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const data = c.req.valid('json');

        const updateData: any = {};
        if (data.courseId !== undefined) updateData.courseId = data.courseId;
        if (data.courseCode !== undefined) updateData.courseCode = data.courseCode;
        if (data.courseName !== undefined) updateData.courseName = data.courseName;
        if (data.title !== undefined) updateData.title = data.title;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);
        if (data.priority !== undefined) updateData.priority = data.priority;
        if (data.status !== undefined) updateData.status = data.status;
        updateData.updatedAt = new Date();

        const [assignment] = await db
            .update(studentAssignments)
            .set(updateData)
            .where(and(
                eq(studentAssignments.id, id),
                eq(studentAssignments.userId, user.id)
            ))
            .returning();

        if (!assignment) {
            return errorResponse(c, 'Assignment not found', 404);
        }

        return successResponse(c, assignment);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to update assignment', 500);
    }
});

/**
 * DELETE /assignments/:id
 * Delete an assignment (authenticated)
 */
app.delete('/assignments/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [deleted] = await db
            .delete(studentAssignments)
            .where(and(
                eq(studentAssignments.id, id),
                eq(studentAssignments.userId, user.id)
            ))
            .returning();

        if (!deleted) {
            return errorResponse(c, 'Assignment not found', 404);
        }

        return successResponse(c, { message: 'Assignment deleted successfully' });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to delete assignment', 500);
    }
});

// ============================================
// EVALUATIONS ENDPOINTS
// ============================================

const evaluationCreateSchema = z.object({
    courseId: z.string().uuid().optional(),
    courseCode: z.string().max(50).optional(),
    courseName: z.string().max(255).optional(),
    title: z.string().max(255),
    type: z.enum(['quiz', 'exam', 'report', 'presentation', 'project']),
    date: z.string().datetime(),
    duration: z.string().max(50).optional().nullable(),
    location: z.string().max(255).optional().nullable(),
    description: z.string().optional(),
});

const evaluationUpdateSchema = evaluationCreateSchema.partial();

/**
 * GET /evaluations
 * Get all evaluations for authenticated user
 */
app.get('/evaluations', protect, async (c) => {
    try {
        const user = c.get('user');
        const limit = parseInt(c.req.query('limit') || '20');
        const upcoming = c.req.query('upcoming') === 'true';

        let query = db.select()
            .from(studentEvaluations)
            .where(eq(studentEvaluations.userId, user.id))
            .orderBy(studentEvaluations.date)
            .limit(limit);

        if (upcoming) {
            query = db.select()
                .from(studentEvaluations)
                .where(
                    and(
                        eq(studentEvaluations.userId, user.id),
                        gte(studentEvaluations.date, new Date())
                    )
                )
                .orderBy(studentEvaluations.date)
                .limit(limit);
        }

        const evaluations = await query;

        return successResponse(c, {
            evaluations,
            count: evaluations.length,
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch evaluations', 500);
    }
});

/**
 * POST /evaluations
 * Create a new evaluation (authenticated)
 */
app.post('/evaluations', protect, zValidator('json', evaluationCreateSchema), async (c) => {
    try {
        const user = c.get('user');
        const data = c.req.valid('json');

        const [evaluation] = await db.insert(studentEvaluations).values({
            userId: user.id,
            courseId: data.courseId,
            courseCode: data.courseCode,
            courseName: data.courseName,
            title: data.title,
            type: data.type,
            date: new Date(data.date),
            duration: data.duration,
            location: data.location,
            description: data.description,
        }).returning();

        return successResponse(c, evaluation, 201);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to create evaluation', 500);
    }
});

/**
 * PUT /evaluations/:id
 * Update an evaluation (authenticated)
 */
app.put('/evaluations/:id', protect, zValidator('json', evaluationUpdateSchema), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const data = c.req.valid('json');

        const updateData: any = {};
        if (data.courseId !== undefined) updateData.courseId = data.courseId;
        if (data.courseCode !== undefined) updateData.courseCode = data.courseCode;
        if (data.courseName !== undefined) updateData.courseName = data.courseName;
        if (data.title !== undefined) updateData.title = data.title;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.date !== undefined) updateData.date = new Date(data.date);
        if (data.duration !== undefined) updateData.duration = data.duration;
        if (data.location !== undefined) updateData.location = data.location;
        if (data.description !== undefined) updateData.description = data.description;
        updateData.updatedAt = new Date();

        const [evaluation] = await db
            .update(studentEvaluations)
            .set(updateData)
            .where(and(
                eq(studentEvaluations.id, id),
                eq(studentEvaluations.userId, user.id)
            ))
            .returning();

        if (!evaluation) {
            return errorResponse(c, 'Evaluation not found', 404);
        }

        return successResponse(c, evaluation);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to update evaluation', 500);
    }
});

/**
 * DELETE /evaluations/:id
 * Delete an evaluation (authenticated)
 */
app.delete('/evaluations/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [deleted] = await db
            .delete(studentEvaluations)
            .where(and(
                eq(studentEvaluations.id, id),
                eq(studentEvaluations.userId, user.id)
            ))
            .returning();

        if (!deleted) {
            return errorResponse(c, 'Evaluation not found', 404);
        }

        return successResponse(c, { message: 'Evaluation deleted successfully' });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to delete evaluation', 500);
    }
});

// ============================================
// MOODLE AUTO-SYNC ENDPOINTS
// ============================================

/**
 * POST /sync-moodle
 * Automatically sync assignments and evaluations from Moodle notifications
 * Uses AI to analyze notifications and extract structured data
 */
app.post('/sync-moodle', protect, async (c) => {
    try {
        const user = c.get('user');

        console.log(`[MoodleSync] Starting sync for user: ${user.id}`);

        const result = await moodleSyncService.syncFromMoodle(user.id);

        if (!result.success) {
            return errorResponse(c, `Sync failed: ${result.errors.join(', ')}`, 500);
        }

        return successResponse(c, {
            message: 'Moodle sync completed successfully',
            result: {
                notificationsAnalyzed: result.notificationsAnalyzed,
                assignmentsCreated: result.assignmentsCreated,
                evaluationsCreated: result.evaluationsCreated,
                errors: result.errors,
            },
        });
    } catch (error: any) {
        console.error('[MoodleSync] Endpoint error:', error);
        return errorResponse(c, error.message || 'Moodle sync failed', 500);
    }
});

/**
 * POST /sync-gmail
 * Automatically sync assignments and evaluations from Gmail emails
 * Uses AI to analyze emails and extract structured data
 */
app.post('/sync-gmail', protect, async (c) => {
    try {
        const user = c.get('user');

        console.log(`[GmailSync] Starting sync for user: ${user.id}`);

        const result = await gmailSyncService.syncFromGmail(user.id);

        if (!result.success) {
            return errorResponse(c, `Sync failed: ${result.errors.join(', ')}`, 500);
        }

        return successResponse(c, {
            message: 'Gmail sync completed successfully',
            result: {
                emailsAnalyzed: result.emailsAnalyzed,
                assignmentsCreated: result.assignmentsCreated,
                evaluationsCreated: result.evaluationsCreated,
                errors: result.errors,
            },
        });
    } catch (error: any) {
        console.error('[GmailSync] Endpoint error:', error);
        return errorResponse(c, error.message || 'Gmail sync failed', 500);
    }
});

/**
 * POST /sync
 * Unified sync endpoint - syncs from both Moodle and Gmail
 * Runs both syncs in parallel for efficiency
 */
app.post('/sync', protect, async (c) => {
    try {
        const user = c.get('user');

        console.log(`[UnifiedSync] Starting sync for user: ${user.id}`);

        // Run both syncs in parallel
        const [moodleResult, gmailResult] = await Promise.allSettled([
            moodleSyncService.syncFromMoodle(user.id),
            gmailSyncService.syncFromGmail(user.id),
        ]);

        // Aggregate results
        const result = {
            moodle: moodleResult.status === 'fulfilled' ? moodleResult.value : {
                success: false,
                notificationsAnalyzed: 0,
                assignmentsCreated: 0,
                evaluationsCreated: 0,
                errors: [moodleResult.reason?.message || 'Moodle sync failed'],
            },
            gmail: gmailResult.status === 'fulfilled' ? gmailResult.value : {
                success: false,
                emailsAnalyzed: 0,
                assignmentsCreated: 0,
                evaluationsCreated: 0,
                errors: [gmailResult.reason?.message || 'Gmail sync failed'],
            },
        };

        const totalAssignments = result.moodle.assignmentsCreated + result.gmail.assignmentsCreated;
        const totalEvaluations = result.moodle.evaluationsCreated + result.gmail.evaluationsCreated;
        const allErrors = [...result.moodle.errors, ...result.gmail.errors];

        return successResponse(c, {
            message: 'Sync completed',
            result: {
                totalAssignmentsCreated: totalAssignments,
                totalEvaluationsCreated: totalEvaluations,
                moodle: {
                    notificationsAnalyzed: result.moodle.notificationsAnalyzed,
                    assignmentsCreated: result.moodle.assignmentsCreated,
                    evaluationsCreated: result.moodle.evaluationsCreated,
                },
                gmail: {
                    emailsAnalyzed: result.gmail.emailsAnalyzed,
                    assignmentsCreated: result.gmail.assignmentsCreated,
                    evaluationsCreated: result.gmail.evaluationsCreated,
                },
                errors: allErrors,
            },
        });
    } catch (error: any) {
        console.error('[UnifiedSync] Endpoint error:', error);
        return errorResponse(c, error.message || 'Sync failed', 500);
    }
});

export default app;

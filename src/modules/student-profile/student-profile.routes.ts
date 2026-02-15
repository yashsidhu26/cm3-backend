import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { studentProfileService } from './student-profile.service';
import { moodleSyncService } from './moodle-sync.service';
import { gmailSyncService } from './gmail-sync.service';
import { db } from '../../core/database/client';
import { activityLogs, studentAssignments, studentEvaluations, syncState, campusEvents, schedules, scheduleItems } from './student-profile.schema';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { eq, and, gte, desc, or } from 'drizzle-orm';

// Background sync tracking
const runningSyncs = new Map<string, Promise<any>>();

/**
 * Helper: Calculate date for recurring weekly schedule item
 * Uses a canonical reference week to ensure absolute consistency
 * Creates dates in UTC to prevent timezone conversion issues
 *
 * Reference: Week of Feb 3, 2025 (Monday Feb 3, 2025)
 * This ensures all recurring events map to the same reference dates
 *
 * @param dayOfWeek - Day of week (e.g., "Monday", "Tuesday")
 * @param timeString - Time in HH:MM format (e.g., "09:00")
 * @returns Date object set to that day/time in the reference week (UTC)
 */
function calculateRecurringDateTime(dayOfWeek: string, timeString: string): Date {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = daysOfWeek.indexOf(dayOfWeek);

    if (targetDayIndex === -1) {
        throw new Error(`Invalid day of week: ${dayOfWeek}`);
    }

    // Parse time
    const [hours, minutes] = timeString.split(':').map(s => parseInt(s));

    // Use canonical reference week: Monday, Feb 3, 2025 (in UTC)
    // This date is chosen as a stable reference point
    const referenceMonday = new Date(Date.UTC(2025, 1, 3, 0, 0, 0, 0)); // Feb = month 1 (0-indexed)

    // Calculate days from Monday to target day
    // Monday = 0 days, Tuesday = 1 day, ..., Sunday = 6 days
    const daysFromMonday = targetDayIndex === 0 ? 6 : targetDayIndex - 1;

    // Create date in UTC to prevent timezone conversion
    const result = new Date(referenceMonday);
    result.setUTCDate(referenceMonday.getUTCDate() + daysFromMonday);
    result.setUTCHours(hours, minutes, 0, 0);

    return result;
}

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

/**
 * GET /focus-data/ai-tips
 * AI-generated tips for focus screen
 */
app.get('/focus-data/ai-tips', protect, async (c) => {
    try {
        const user = c.get('user');
        const tips = await studentProfileService.getAiTips(user.id);
        return successResponse(c, tips);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch AI tips', 500);
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

/**
 * PATCH /assignments/:id/mark-done
 * Mark an assignment as completed (authenticated)
 */
app.patch('/assignments/:id/mark-done', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [assignment] = await db
            .update(studentAssignments)
            .set({
                status: 'submitted',
                updatedAt: new Date(),
            })
            .where(and(
                eq(studentAssignments.id, id),
                eq(studentAssignments.userId, user.id)
            ))
            .returning();

        if (!assignment) {
            return errorResponse(c, 'Assignment not found', 404);
        }

        return successResponse(c, {
            message: 'Assignment marked as done',
            assignment,
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to mark assignment as done', 500);
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
// CAMPUS EVENTS ENDPOINTS
// ============================================

/**
 * GET /events/upcoming
 * Get upcoming campus events (authenticated)
 */
app.get('/events/upcoming', protect, async (c) => {
    try {
        const user = c.get('user');
        const now = new Date();

        const events = await db
            .select()
            .from(campusEvents)
            .where(and(
                eq(campusEvents.userId, user.id),
                gte(campusEvents.date, now)
            ))
            .orderBy(campusEvents.date)
            .limit(50);

        return successResponse(c, events);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch upcoming events', 500);
    }
});

/**
 * GET /events
 * Get all campus events (authenticated)
 */
app.get('/events', protect, async (c) => {
    try {
        const user = c.get('user');

        const events = await db
            .select()
            .from(campusEvents)
            .where(eq(campusEvents.userId, user.id))
            .orderBy(desc(campusEvents.date));

        return successResponse(c, events);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch events', 500);
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
 * POST /force-sync-gmail
 * Force full resync from Gmail (ignores last sync timestamp, reprocesses last 90 days)
 * Use this when you want to resync all emails or fix sync issues
 */
app.post('/force-sync-gmail', protect, async (c) => {
    try {
        const user = c.get('user');

        console.log(`[GmailSync] Starting FORCE sync for user: ${user.id}`);

        const result = await gmailSyncService.forceSyncFromGmail(user.id);

        if (!result.success) {
            return errorResponse(c, `Force sync failed: ${result.errors.join(', ')}`, 500);
        }

        return successResponse(c, {
            message: 'Gmail force sync completed successfully',
            result: {
                emailsAnalyzed: result.emailsAnalyzed,
                emailsSkipped: result.emailsSkipped,
                assignmentsCreated: result.assignmentsCreated,
                evaluationsCreated: result.evaluationsCreated,
                eventsCreated: result.eventsCreated,
                errors: result.errors,
            },
        });
    } catch (error: any) {
        console.error('[GmailSync] Force sync endpoint error:', error);
        return errorResponse(c, error.message || 'Gmail force sync failed', 500);
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

// ============================================
// SCHEDULES / TIMETABLES ENDPOINTS
// ============================================

const scheduleCreateSchema = z.object({
    name: z.string().max(255),
    description: z.string().optional(),
    isActive: z.boolean().optional().default(false),
    semester: z.enum(['fall', 'spring', 'summer']).optional(),
    year: z.string().max(10).optional(),
});

const scheduleUpdateSchema = scheduleCreateSchema.partial();

const scheduleItemCreateSchema = z.object({
    scheduleId: z.string().uuid(),
    title: z.string().max(255),
    description: z.string().optional(),
    type: z.enum(['class', 'assignment', 'evaluation', 'event', 'custom']),
    linkedEntityId: z.string().uuid().optional(),
    linkedEntityType: z.enum(['section', 'assignment', 'evaluation', 'event']).optional(),
    startDateTime: z.string().datetime(),
    endDateTime: z.string().datetime(),
    isRecurring: z.boolean().optional().default(false),
    recurrencePattern: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'none']).optional().default('none'),
    recurrenceEndDate: z.string().datetime().optional(),
    dayOfWeek: z.string().max(20).optional(),
    location: z.string().max(255).optional(),
    color: z.string().max(7).optional(),
});

const scheduleItemUpdateSchema = scheduleItemCreateSchema.partial().omit({ scheduleId: true });

const freeSlotAddSchema = z.object({
    startDateTime: z.string().datetime(),
    endDateTime: z.string().datetime(),
    title: z.string().max(255).optional(),
    description: z.string().optional(),
    location: z.string().max(255).optional(),
    color: z.string().max(7).optional(),
});

function parseDateParam(dateParam?: string | null) {
    if (!dateParam) return null;
    const [year, month, day] = dateParam.split('-').map(Number);
    if (!year || !month || !day) return null;
    return { year, month, day };
}

function createUtcDate(year: number, month: number, day: number, hours = 0, minutes = 0) {
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
}

function parseDayWindow(dateParam: string | null, start?: string | null, end?: string | null) {
    const parsed = parseDateParam(dateParam);
    const today = new Date();
    const year = parsed?.year ?? today.getUTCFullYear();
    const month = parsed?.month ?? (today.getUTCMonth() + 1);
    const day = parsed?.day ?? today.getUTCDate();

    const startTime = start || '00:00';
    const endTime = end || '23:59';

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    const windowStart = createUtcDate(year, month, day, sh, sm);
    const windowEnd = createUtcDate(year, month, day, eh, em);
    if (windowEnd <= windowStart) {
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    }

    return { windowStart, windowEnd };
}

function buildDateTimeWithTime(date: Date, source: Date) {
    const result = new Date(date);
    result.setUTCHours(source.getUTCHours(), source.getUTCMinutes(), 0, 0);
    return result;
}

function getDayName(date: Date) {
    const dayIndex = date.getUTCDay();
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[dayIndex];
}

function floorToMinuteLocal(date: Date) {
    const d = new Date(date);
    d.setSeconds(0, 0);
    return d;
}

function ceilToSlotLocalByClock(date: Date, minutes: number) {
    const d = new Date(date);
    const minute = d.getMinutes();
    const remainder = minute % minutes;
    if (remainder === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) {
        return d;
    }
    const add = remainder === 0 ? 0 : minutes - remainder;
    d.setMinutes(d.getMinutes() + add);
    d.setSeconds(0, 0);
    return d;
}

function splitIntoHourSlots(start: Date, end: Date, minutes: number) {
    const slots: { start: string; end: string }[] = [];
    const stepMinutes = Math.max(minutes, 5);
    const stepMs = stepMinutes * 60 * 1000;
    let cursor = ceilToSlotLocalByClock(floorToMinuteLocal(start), stepMinutes);
    const endFloor = floorToMinuteLocal(end);
    while (cursor.getTime() + stepMs <= endFloor.getTime()) {
        const next = new Date(cursor.getTime() + stepMs);
        slots.push({ start: cursor.toISOString(), end: next.toISOString() });
        cursor = next;
    }
    return slots;
}

function parseUtcDateTime(input: string) {
    // If timezone is missing, treat as UTC by appending Z
    const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
    const normalized = hasTimezone ? input : `${input}Z`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid datetime');
    }
    return parsed;
}

/**
 * GET /schedules
 * Get all schedules for user
 */
app.get('/schedules', protect, async (c) => {
    try {
        const user = c.get('user');

        const userSchedules = await db
            .select()
            .from(schedules)
            .where(eq(schedules.userId, user.id))
            .orderBy(desc(schedules.isActive), desc(schedules.createdAt));

        const now = Date.now();
        const mapped = userSchedules.map((schedule) => {
            const expiresAt = schedule.expiresAt ? new Date(schedule.expiresAt) : null;
            const expiresInHours =
                expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - now) / (60 * 60 * 1000))) : null;
            return {
                ...schedule,
                expiresInHours,
            };
        });

        return successResponse(c, mapped);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch schedules', 500);
    }
});

/**
 * GET /schedules/:id
 * Get schedule with all items
 */
app.get('/schedules/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, id), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        const items = await db
            .select()
            .from(scheduleItems)
            .where(eq(scheduleItems.scheduleId, id))
            .orderBy(scheduleItems.startDateTime);

        return successResponse(c, { ...schedule, items });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch schedule', 500);
    }
});

/**
 * POST /schedules
 * Create new schedule
 */
app.post('/schedules', protect, zValidator('json', scheduleCreateSchema), async (c) => {
    try {
        const user = c.get('user');
        const data = c.req.valid('json');

        // If setting as active, deactivate all others
        if (data.isActive) {
            await db
                .update(schedules)
                .set({ isActive: false })
                .where(eq(schedules.userId, user.id));
        }

        const [schedule] = await db
            .insert(schedules)
            .values({
                ...data,
                userId: user.id,
            })
            .returning();

        return successResponse(c, schedule);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to create schedule', 500);
    }
});

/**
 * PUT /schedules/:id
 * Update schedule
 */
app.put('/schedules/:id', protect, zValidator('json', scheduleUpdateSchema), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const data = c.req.valid('json');

        // If setting as active, deactivate all others
        if (data.isActive) {
            await db
                .update(schedules)
                .set({ isActive: false })
                .where(eq(schedules.userId, user.id));
        }

        const [schedule] = await db
            .update(schedules)
            .set({ ...data, updatedAt: new Date() })
            .where(and(eq(schedules.id, id), eq(schedules.userId, user.id)))
            .returning();

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        return successResponse(c, schedule);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to update schedule', 500);
    }
});

/**
 * DELETE /schedules/:id
 * Delete schedule (cascades to items)
 */
app.delete('/schedules/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [deleted] = await db
            .delete(schedules)
            .where(and(eq(schedules.id, id), eq(schedules.userId, user.id)))
            .returning();

        if (!deleted) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        return successResponse(c, { message: 'Schedule deleted successfully' });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to delete schedule', 500);
    }
});

/**
 * POST /schedules/:id/set-active
 * Set schedule as active (deactivates others)
 */
app.post('/schedules/:id/set-active', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        // Deactivate all
        await db
            .update(schedules)
            .set({ isActive: false })
            .where(eq(schedules.userId, user.id));

        // Activate this one
        const [schedule] = await db
            .update(schedules)
            .set({ isActive: true, updatedAt: new Date() })
            .where(and(eq(schedules.id, id), eq(schedules.userId, user.id)))
            .returning();

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        return successResponse(c, schedule);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to set active schedule', 500);
    }
});

/**
 * GET /schedules/active/free-slots
 * Get free time slots for today (split into 1-hour slots)
 */
app.get('/schedules/active/free-slots', protect, async (c) => {
    try {
        const user = c.get('user');
        const dateParam = c.req.query('date') || null;
        const dayStart = c.req.query('dayStart');
        const dayEnd = c.req.query('dayEnd');
        const slotMinutesParam = c.req.query('slotMinutes');
        const slotMinutes = slotMinutesParam ? Number(slotMinutesParam) : 60;
        if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
            return errorResponse(c, 'Invalid slotMinutes (5-240)', 400, 'INVALID_SLOT_MINUTES');
        }

        const [activeSchedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.userId, user.id), eq(schedules.isActive, true)))
            .orderBy(desc(schedules.createdAt))
            .limit(1);

        if (!activeSchedule) {
            return errorResponse(c, 'Active schedule not found', 404);
        }

        const { windowStart, windowEnd } = parseDayWindow(dateParam, dayStart, dayEnd);
        const dayName = getDayName(windowStart);

        const items = await db
            .select()
            .from(scheduleItems)
            .where(eq(scheduleItems.scheduleId, activeSchedule.id));

        const busyIntervals: Array<{ start: Date; end: Date }> = [];

        for (const item of items) {
            if (item.isRecurring && item.dayOfWeek === dayName) {
                const start = buildDateTimeWithTime(targetDate, new Date(item.startDateTime));
                const end = buildDateTimeWithTime(targetDate, new Date(item.endDateTime));
                busyIntervals.push({ start, end });
                continue;
            }

            const start = new Date(item.startDateTime);
            const end = new Date(item.endDateTime);
            if (end <= windowStart || start >= windowEnd) continue;
            busyIntervals.push({
                start: start < windowStart ? windowStart : start,
                end: end > windowEnd ? windowEnd : end,
            });
        }

        busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

        const slots: { start: string; end: string }[] = [];
        const stepMs = Math.max(slotMinutes, 5) * 60 * 1000;
        let cursor = ceilToSlotLocalByClock(floorToMinuteLocal(windowStart), slotMinutes);

        while (cursor.getTime() + stepMs <= windowEnd.getTime()) {
            const next = new Date(cursor.getTime() + stepMs);
            const overlaps = busyIntervals.some(
                (interval) => cursor < interval.end && next > interval.start
            );
            if (!overlaps) {
                slots.push({ start: cursor.toISOString(), end: next.toISOString() });
            }
            cursor = next;
        }

        return successResponse(c, {
            date: dateParam || windowStart.toISOString().slice(0, 10),
            scheduleId: activeSchedule.id,
            slots,
        });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch free slots', 500);
    }
});

/**
 * POST /schedules/active/add-free-slot
 * Add a custom slot to the active schedule
 */
app.post(
    '/schedules/active/add-free-slot',
    protect,
    zValidator('json', freeSlotAddSchema),
    async (c) => {
        try {
            const user = c.get('user');
            const data = c.req.valid('json');

            const [activeSchedule] = await db
                .select()
                .from(schedules)
                .where(and(eq(schedules.userId, user.id), eq(schedules.isActive, true)))
                .orderBy(desc(schedules.createdAt))
                .limit(1);

            if (!activeSchedule) {
                return errorResponse(c, 'Active schedule not found', 404);
            }

            const [item] = await db
                .insert(scheduleItems)
                .values({
                    scheduleId: activeSchedule.id,
                    userId: user.id,
                    title: data.title || 'Custom Slot',
                    description: data.description,
                    type: 'custom',
                    startDateTime: parseUtcDateTime(data.startDateTime),
                    endDateTime: parseUtcDateTime(data.endDateTime),
                    location: data.location,
                    color: data.color,
                })
                .returning();

            return successResponse(c, item);
        } catch (error: any) {
            return errorResponse(c, error.message || 'Failed to add schedule slot', 500);
        }
    }
);

// ============================================
// SCHEDULE ITEMS ENDPOINTS
// ============================================

/**
 * Helper: Auto-sync assignments, evaluations, and events to schedule
 */
async function autoSyncScheduleItems(scheduleId: string, userId: string): Promise<{
    assignmentsAdded: number;
    evaluationsAdded: number;
    eventsAdded: number;
}> {
    let assignmentsAdded = 0;
    let evaluationsAdded = 0;
    let eventsAdded = 0;
    const now = new Date();

    try {
        // 1. Sync Assignments
        const assignments = await db
            .select()
            .from(studentAssignments)
            .where(and(
                eq(studentAssignments.userId, userId),
                gte(studentAssignments.dueDate, now)
            ))
            .orderBy(studentAssignments.dueDate)
            .limit(50);

        for (const assignment of assignments) {
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(and(
                    eq(scheduleItems.scheduleId, scheduleId),
                    eq(scheduleItems.linkedEntityId, assignment.id)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(scheduleItems).values({
                    scheduleId,
                    userId,
                    title: assignment.title,
                    description: `${assignment.courseCode} - ${assignment.description || ''}`,
                    type: 'assignment',
                    linkedEntityId: assignment.id,
                    linkedEntityType: 'assignment',
                    startDateTime: assignment.dueDate,
                    endDateTime: assignment.dueDate,
                    isRecurring: false,
                    recurrencePattern: 'none',
                    color: '#FF6B6B',
                });
                assignmentsAdded++;
            }
        }

        // 2. Sync Evaluations
        const evaluations = await db
            .select()
            .from(studentEvaluations)
            .where(and(
                eq(studentEvaluations.userId, userId),
                gte(studentEvaluations.date, now)
            ))
            .orderBy(studentEvaluations.date)
            .limit(50);

        for (const evaluation of evaluations) {
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(and(
                    eq(scheduleItems.scheduleId, scheduleId),
                    eq(scheduleItems.linkedEntityId, evaluation.id)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(scheduleItems).values({
                    scheduleId,
                    userId,
                    title: evaluation.title,
                    description: `${evaluation.courseCode} - ${evaluation.type} ${evaluation.description ? '- ' + evaluation.description : ''}`,
                    type: 'evaluation',
                    linkedEntityId: evaluation.id,
                    linkedEntityType: 'evaluation',
                    startDateTime: evaluation.date,
                    endDateTime: evaluation.date,
                    location: evaluation.location,
                    isRecurring: false,
                    recurrencePattern: 'none',
                    color: '#FFA500',
                });
                evaluationsAdded++;
            }
        }

        // 3. Sync Events (enrolled or interested)
        const events = await db
            .select()
            .from(campusEvents)
            .where(and(
                eq(campusEvents.userId, userId),
                gte(campusEvents.date, now),
                or(eq(campusEvents.isEnrolled, true), eq(campusEvents.isInterested, true))
            ))
            .orderBy(campusEvents.date)
            .limit(50);

        for (const event of events) {
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(and(
                    eq(scheduleItems.scheduleId, scheduleId),
                    eq(scheduleItems.linkedEntityId, event.id)
                ))
                .limit(1);

            if (existing.length === 0) {
                await db.insert(scheduleItems).values({
                    scheduleId,
                    userId,
                    title: event.title,
                    description: `${event.type} - ${event.description || ''}`,
                    type: 'event',
                    linkedEntityId: event.id,
                    linkedEntityType: 'event',
                    startDateTime: event.date,
                    endDateTime: event.endDate || event.date,
                    location: event.location,
                    isRecurring: false,
                    recurrencePattern: 'none',
                    color: '#4CAF50',
                });
                eventsAdded++;
            }
        }

        return { assignmentsAdded, evaluationsAdded, eventsAdded };
    } catch (error) {
        console.error('[AutoSync] Error syncing schedule items:', error);
        return { assignmentsAdded, evaluationsAdded, eventsAdded };
    }
}

/**
 * GET /schedules/:scheduleId/items
 * Get all items for a schedule (auto-syncs assignments, evaluations, and events first)
 */
app.get('/schedules/:scheduleId/items', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('scheduleId');

        // Verify schedule belongs to user
        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        // Auto-sync assignments, evaluations, and events before returning items
        console.log(`[Schedule Items] Auto-syncing items for schedule ${scheduleId}...`);
        const syncResult = await autoSyncScheduleItems(scheduleId, user.id);
        console.log(`[Schedule Items] Synced: ${syncResult.assignmentsAdded} assignments, ${syncResult.evaluationsAdded} evaluations, ${syncResult.eventsAdded} events`);

        // Get all items
        const items = await db
            .select()
            .from(scheduleItems)
            .where(eq(scheduleItems.scheduleId, scheduleId))
            .orderBy(scheduleItems.startDateTime);

        return successResponse(c, items);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to fetch schedule items', 500);
    }
});

/**
 * POST /schedule-items
 * Create schedule item
 */
app.post('/schedule-items', protect, zValidator('json', scheduleItemCreateSchema), async (c) => {
    try {
        const user = c.get('user');
        const data = c.req.valid('json');

        // Verify schedule belongs to user
        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, data.scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        const [item] = await db
            .insert(scheduleItems)
            .values({
                ...data,
                userId: user.id,
                startDateTime: new Date(data.startDateTime),
                endDateTime: new Date(data.endDateTime),
                recurrenceEndDate: data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : null,
            })
            .returning();

        return successResponse(c, item);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to create schedule item', 500);
    }
});

/**
 * PUT /schedule-items/:id
 * Update schedule item
 */
app.put('/schedule-items/:id', protect, zValidator('json', scheduleItemUpdateSchema), async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');
        const data = c.req.valid('json');

        const updateData: any = { ...data, updatedAt: new Date() };
        if (data.startDateTime) updateData.startDateTime = new Date(data.startDateTime);
        if (data.endDateTime) updateData.endDateTime = new Date(data.endDateTime);
        if (data.recurrenceEndDate) updateData.recurrenceEndDate = new Date(data.recurrenceEndDate);

        const [item] = await db
            .update(scheduleItems)
            .set(updateData)
            .where(and(eq(scheduleItems.id, id), eq(scheduleItems.userId, user.id)))
            .returning();

        if (!item) {
            return errorResponse(c, 'Schedule item not found', 404);
        }

        return successResponse(c, item);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to update schedule item', 500);
    }
});

/**
 * DELETE /schedule-items/:id
 * Delete schedule item
 */
app.delete('/schedule-items/:id', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [deleted] = await db
            .delete(scheduleItems)
            .where(and(eq(scheduleItems.id, id), eq(scheduleItems.userId, user.id)))
            .returning();

        if (!deleted) {
            return errorResponse(c, 'Schedule item not found', 404);
        }

        return successResponse(c, { message: 'Schedule item deleted successfully' });
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to delete schedule item', 500);
    }
});

/**
 * POST /schedules/:id/generate-from-sections
 * Generate schedule items from user's registered sections
 */
app.post('/schedules/:id/generate-from-sections', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('id');

        // Verify schedule belongs to user
        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        // Get user's registered sections
        const { sectionsService } = await import('../academics/sections.service');
        const registrations = await sectionsService.getUserRegistrations(user.id);

        let itemsCreated = 0;

        // Create schedule items for each class timing
        for (const registration of registrations) {
            for (const timing of registration.schedule) {
                // Check if item already exists (by linkedEntityId)
                const existing = await db
                    .select()
                    .from(scheduleItems)
                    .where(
                        and(
                            eq(scheduleItems.scheduleId, scheduleId),
                            eq(scheduleItems.linkedEntityId, registration.sectionId),
                            eq(scheduleItems.dayOfWeek, timing.dayOfWeek)
                        )
                    )
                    .limit(1);

                if (existing.length > 0) continue;

                // Create schedule item with consistent base date
                const startDateTime = calculateRecurringDateTime(timing.dayOfWeek, timing.startTime);
                const endDateTime = calculateRecurringDateTime(timing.dayOfWeek, timing.endTime);

                await db.insert(scheduleItems).values({
                    scheduleId,
                    userId: user.id,
                    title: `${registration.courseCode} - ${registration.sectionType}`,
                    description: `${registration.courseName} (${registration.sectionType} ${registration.sectionNumber})`,
                    type: 'class',
                    linkedEntityId: registration.sectionId,
                    linkedEntityType: 'section',
                    startDateTime,
                    endDateTime,
                    isRecurring: true,
                    recurrencePattern: 'weekly',
                    dayOfWeek: timing.dayOfWeek,
                    location: registration.roomNumber || undefined,
                });

                itemsCreated++;
            }
        }

        return successResponse(c, {
            message: `Generated ${itemsCreated} schedule items from registered sections`,
            itemsCreated,
        });
    } catch (error: any) {
        console.error('Failed to generate schedule from sections:', error);
        return errorResponse(c, error.message || 'Failed to generate schedule', 500);
    }
});

/**
 * POST /schedules/:id/add-assignments
 * Add upcoming assignments to schedule
 */
app.post('/schedules/:id/add-assignments', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('id');

        // Verify schedule
        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        // Get upcoming assignments
        const now = new Date();
        const assignments = await db
            .select()
            .from(studentAssignments)
            .where(and(
                eq(studentAssignments.userId, user.id),
                gte(studentAssignments.dueDate, now)
            ))
            .orderBy(studentAssignments.dueDate)
            .limit(50);

        let itemsCreated = 0;

        for (const assignment of assignments) {
            // Check if already added
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(
                    and(
                        eq(scheduleItems.scheduleId, scheduleId),
                        eq(scheduleItems.linkedEntityId, assignment.id)
                    )
                )
                .limit(1);

            if (existing.length > 0) continue;

            // Add to schedule
            await db.insert(scheduleItems).values({
                scheduleId,
                userId: user.id,
                title: assignment.title,
                description: `${assignment.courseCode} - ${assignment.description || ''}`,
                type: 'assignment',
                linkedEntityId: assignment.id,
                linkedEntityType: 'assignment',
                startDateTime: assignment.dueDate,
                endDateTime: assignment.dueDate,
                isRecurring: false,
                recurrencePattern: 'none',
                color: '#FF6B6B',
            });

            itemsCreated++;
        }

        return successResponse(c, {
            message: `Added ${itemsCreated} assignments to schedule`,
            itemsCreated,
        });
    } catch (error: any) {
        console.error('Failed to add assignments to schedule:', error);
        return errorResponse(c, error.message || 'Failed to add assignments', 500);
    }
});

/**
 * POST /schedules/:id/add-evaluations
 * Add upcoming evaluations to schedule
 */
app.post('/schedules/:id/add-evaluations', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('id');

        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        const now = new Date();
        const evaluations = await db
            .select()
            .from(studentEvaluations)
            .where(and(
                eq(studentEvaluations.userId, user.id),
                gte(studentEvaluations.date, now)
            ))
            .orderBy(studentEvaluations.date)
            .limit(50);

        let itemsCreated = 0;

        for (const evaluation of evaluations) {
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(
                    and(
                        eq(scheduleItems.scheduleId, scheduleId),
                        eq(scheduleItems.linkedEntityId, evaluation.id)
                    )
                )
                .limit(1);

            if (existing.length > 0) continue;

            const endDateTime = evaluation.duration
                ? new Date(evaluation.date.getTime() + parseInt(evaluation.duration) * 60000)
                : new Date(evaluation.date.getTime() + 120 * 60000); // Default 2 hours

            await db.insert(scheduleItems).values({
                scheduleId,
                userId: user.id,
                title: `${evaluation.type.toUpperCase()}: ${evaluation.title}`,
                description: `${evaluation.courseCode} - ${evaluation.description || ''}`,
                type: 'evaluation',
                linkedEntityId: evaluation.id,
                linkedEntityType: 'evaluation',
                startDateTime: evaluation.date,
                endDateTime,
                isRecurring: false,
                recurrencePattern: 'none',
                location: evaluation.location || undefined,
                color: '#4ECDC4',
            });

            itemsCreated++;
        }

        return successResponse(c, {
            message: `Added ${itemsCreated} evaluations to schedule`,
            itemsCreated,
        });
    } catch (error: any) {
        console.error('Failed to add evaluations to schedule:', error);
        return errorResponse(c, error.message || 'Failed to add evaluations', 500);
    }
});

/**
 * POST /schedules/:id/regenerate-classes
 * Delete and regenerate all class schedule items from registered sections
 * Use this after fixing timezone issues
 */
app.post('/schedules/:id/regenerate-classes', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('id');

        // Verify schedule belongs to user
        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        // Delete all class-type schedule items
        const deleted = await db
            .delete(scheduleItems)
            .where(and(
                eq(scheduleItems.scheduleId, scheduleId),
                eq(scheduleItems.type, 'class')
            ))
            .returning();

        console.log(`[RegenerateClasses] Deleted ${deleted.length} class items`);

        // Regenerate from sections
        const { sectionsService } = await import('../academics/sections.service');
        const registrations = await sectionsService.getUserRegistrations(user.id);

        let itemsCreated = 0;

        for (const registration of registrations) {
            for (const timing of registration.schedule) {
                const startDateTime = calculateRecurringDateTime(timing.dayOfWeek, timing.startTime);
                const endDateTime = calculateRecurringDateTime(timing.dayOfWeek, timing.endTime);

                await db.insert(scheduleItems).values({
                    scheduleId,
                    userId: user.id,
                    title: `${registration.courseCode} - ${registration.sectionType}`,
                    description: `${registration.courseName} (${registration.sectionType} ${registration.sectionNumber})`,
                    type: 'class',
                    linkedEntityId: registration.sectionId,
                    linkedEntityType: 'section',
                    startDateTime,
                    endDateTime,
                    isRecurring: true,
                    recurrencePattern: 'weekly',
                    dayOfWeek: timing.dayOfWeek,
                    location: registration.roomNumber || undefined,
                });

                itemsCreated++;
            }
        }

        return successResponse(c, {
            message: 'Classes regenerated successfully',
            deleted: deleted.length,
            created: itemsCreated,
        });
    } catch (error: any) {
        console.error('[RegenerateClasses] Error:', error);
        return errorResponse(c, error.message || 'Failed to regenerate classes', 500);
    }
});

/**
 * POST /schedules/:id/add-events
 * Add enrolled/interested campus events to schedule
 */
app.post('/schedules/:id/add-events', protect, async (c) => {
    try {
        const user = c.get('user');
        const scheduleId = c.req.param('id');

        const [schedule] = await db
            .select()
            .from(schedules)
            .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, user.id)))
            .limit(1);

        if (!schedule) {
            return errorResponse(c, 'Schedule not found', 404);
        }

        const now = new Date();
        const events = await db
            .select()
            .from(campusEvents)
            .where(and(
                eq(campusEvents.userId, user.id),
                gte(campusEvents.date, now),
                or(eq(campusEvents.isEnrolled, true), eq(campusEvents.isInterested, true))
            ))
            .orderBy(campusEvents.date)
            .limit(50);

        let itemsCreated = 0;

        for (const event of events) {
            const existing = await db
                .select()
                .from(scheduleItems)
                .where(
                    and(
                        eq(scheduleItems.scheduleId, scheduleId),
                        eq(scheduleItems.linkedEntityId, event.id)
                    )
                )
                .limit(1);

            if (existing.length > 0) continue;

            const endDateTime = event.endDate || new Date(event.date.getTime() + 180 * 60000); // Default 3 hours

            await db.insert(scheduleItems).values({
                scheduleId,
                userId: user.id,
                title: event.title,
                description: `${event.type} - ${event.organizer || ''}`,
                type: 'event',
                linkedEntityId: event.id,
                linkedEntityType: 'event',
                startDateTime: event.date,
                endDateTime,
                isRecurring: false,
                recurrencePattern: 'none',
                location: event.location || undefined,
                color: '#FFEAA7',
            });

            itemsCreated++;
        }

        return successResponse(c, {
            message: `Added ${itemsCreated} events to schedule`,
            itemsCreated,
        });
    } catch (error: any) {
        console.error('Failed to add events to schedule:', error);
        return errorResponse(c, error.message || 'Failed to add events', 500);
    }
});

/**
 * PATCH /events/:id/mark-interested
 * Mark event as interested
 */
app.patch('/events/:id/mark-interested', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [event] = await db
            .update(campusEvents)
            .set({ isInterested: true, updatedAt: new Date() })
            .where(and(eq(campusEvents.id, id), eq(campusEvents.userId, user.id)))
            .returning();

        if (!event) {
            return errorResponse(c, 'Event not found', 404);
        }

        return successResponse(c, event);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to mark event as interested', 500);
    }
});

/**
 * PATCH /events/:id/mark-enrolled
 * Mark event as enrolled
 */
app.patch('/events/:id/mark-enrolled', protect, async (c) => {
    try {
        const user = c.get('user');
        const id = c.req.param('id');

        const [event] = await db
            .update(campusEvents)
            .set({ isEnrolled: true, updatedAt: new Date() })
            .where(and(eq(campusEvents.id, id), eq(campusEvents.userId, user.id)))
            .returning();

        if (!event) {
            return errorResponse(c, 'Event not found', 404);
        }

        return successResponse(c, event);
    } catch (error: any) {
        return errorResponse(c, error.message || 'Failed to mark event as enrolled', 500);
    }
});

/**
 * POST /fix-schedule-dates
 * One-time fix to correct startDateTime/endDateTime for existing class schedule items
 * This fixes items created with the old buggy code that didn't align dates with dayOfWeek
 */
app.post('/fix-schedule-dates', protect, async (c) => {
    try {
        const user = c.get('user');

        // Get all class-type recurring schedule items for the user
        const classItems = await db
            .select()
            .from(scheduleItems)
            .where(and(
                eq(scheduleItems.userId, user.id),
                eq(scheduleItems.type, 'class'),
                eq(scheduleItems.isRecurring, true)
            ));

        let itemsFixed = 0;
        let itemsSkipped = 0;

        for (const item of classItems) {
            // Skip if no dayOfWeek specified
            if (!item.dayOfWeek) {
                itemsSkipped++;
                continue;
            }

            // Extract time from existing startDateTime
            const existingStartTime = `${String(item.startDateTime.getHours()).padStart(2, '0')}:${String(item.startDateTime.getMinutes()).padStart(2, '0')}`;
            const existingEndTime = `${String(item.endDateTime.getHours()).padStart(2, '0')}:${String(item.endDateTime.getMinutes()).padStart(2, '0')}`;

            // Calculate correct dates using helper function
            const newStartDateTime = calculateRecurringDateTime(item.dayOfWeek, existingStartTime);
            const newEndDateTime = calculateRecurringDateTime(item.dayOfWeek, existingEndTime);

            // Check if already correct (same day of week)
            if (item.startDateTime.getDay() === newStartDateTime.getDay()) {
                itemsSkipped++;
                continue;
            }

            // Update the item
            await db
                .update(scheduleItems)
                .set({
                    startDateTime: newStartDateTime,
                    endDateTime: newEndDateTime,
                    updatedAt: new Date(),
                })
                .where(eq(scheduleItems.id, item.id));

            itemsFixed++;
        }

        return successResponse(c, {
            message: 'Schedule dates fixed successfully',
            itemsFixed,
            itemsSkipped,
            totalProcessed: classItems.length,
        });
    } catch (error: any) {
        console.error('[FixScheduleDates] Error:', error);
        return errorResponse(c, error.message || 'Failed to fix schedule dates', 500);
    }
});

export default app;

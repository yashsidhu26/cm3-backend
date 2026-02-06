import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { studentProfileService } from './student-profile.service';
import { db } from '../../core/database/client';
import { activityLogs } from './student-profile.schema';

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

export default app;

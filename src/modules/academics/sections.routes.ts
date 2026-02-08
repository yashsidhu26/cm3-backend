/**
 * Sections Routes
 * API endpoints for managing course sections, schedules, and user registrations
 */

import { Hono } from 'hono';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { sectionsService } from './sections.service';
import { studyDeckService, StudyDeckError } from './studydeck.service';
import { db } from '../../core/database/client';
import { courses } from './academics.schema';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

/**
 * POST /sync/:courseId
 * Sync course sections from StudyDeck
 * Uses STUDYDECK_JWT_TOKEN from environment
 */
app.post('/sync/:courseId', protect, async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');

  if (!process.env.STUDYDECK_JWT_TOKEN) {
    return errorResponse(c, 'StudyDeck JWT token not configured. Set STUDYDECK_JWT_TOKEN in .env', 500);
  }

  try {
    // Get course to find staticId
    const course = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (course.length === 0) {
      return errorResponse(c, 'Course not found', 404);
    }

    if (!course[0].staticId) {
      return errorResponse(c, 'Course does not have a static ID', 400);
    }

    // Sync sections
    const syncedCount = await sectionsService.syncCourseSections(
      courseId,
      course[0].staticId
    );

    return successResponse(c, {
      message: 'Course sections synced successfully',
      syncedSections: syncedCount,
    });
  } catch (error: any) {
    console.error('Section sync failed:', error);
    if (error instanceof StudyDeckError) {
      return errorResponse(c, error.message, error.statusCode, error.code);
    }
    return errorResponse(c, 'Failed to sync course sections', 500);
  }
});

/**
 * GET /:courseId
 * Get all sections for a course
 */
app.get('/:courseId', protect, async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const sections = await sectionsService.getCourseSections(courseId);
    return successResponse(c, { sections, count: sections.length });
  } catch (error: any) {
    console.error('Failed to get sections:', error);
    return errorResponse(c, 'Failed to fetch course sections', 500);
  }
});

/**
 * GET /:courseId/registered
 * Get sections user is registered for a specific course
 */
app.get('/:courseId/registered', protect, async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');

  try {
    const registeredSectionIds = await sectionsService.getUserRegisteredSections(
      user.id,
      courseId
    );
    return successResponse(c, { sectionIds: registeredSectionIds });
  } catch (error: any) {
    console.error('Failed to get registered sections:', error);
    return errorResponse(c, 'Failed to fetch registered sections', 500);
  }
});

/**
 * POST /register
 * Register user for a section
 */
const registerSchema = z.object({
  sectionId: z.string().uuid(),
});

app.post('/register', protect, zValidator('json', registerSchema), async (c) => {
  const user = c.get('user');
  const { sectionId } = c.req.valid('json');

  try {
    await sectionsService.registerUserForSection(user.id, sectionId);
    return successResponse(c, { message: 'Registered for section successfully' });
  } catch (error: any) {
    console.error('Section registration failed:', error);
    return errorResponse(c, 'Failed to register for section', 500);
  }
});

/**
 * DELETE /unregister/:sectionId
 * Unregister user from a section
 */
app.delete('/unregister/:sectionId', protect, async (c) => {
  const user = c.get('user');
  const sectionId = c.req.param('sectionId');

  try {
    await sectionsService.unregisterUserFromSection(user.id, sectionId);
    return successResponse(c, { message: 'Unregistered from section successfully' });
  } catch (error: any) {
    console.error('Section unregistration failed:', error);
    return errorResponse(c, 'Failed to unregister from section', 500);
  }
});

/**
 * POST /:courseId/register-bulk
 * Bulk register for multiple sections of a course
 */
const bulkRegisterSchema = z.object({
  sectionIds: z.array(z.string().uuid()),
});

app.post(
  '/:courseId/register-bulk',
  protect,
  zValidator('json', bulkRegisterSchema),
  async (c) => {
    const user = c.get('user');
    const courseId = c.req.param('courseId');
    const { sectionIds } = c.req.valid('json');

    try {
      await sectionsService.replaceUserSections(user.id, courseId, sectionIds);
      return successResponse(c, {
        message: 'Section registrations updated successfully',
        registeredSections: sectionIds.length,
      });
    } catch (error: any) {
      console.error('Bulk registration failed:', error);
      return errorResponse(c, 'Failed to update section registrations', 500);
    }
  }
);

/**
 * GET /schedule/me
 * Get user's complete schedule (all registered sections)
 */
app.get('/schedule/me', protect, async (c) => {
  const user = c.get('user');

  try {
    const schedule = await sectionsService.getUserSchedule(user.id);
    return successResponse(c, { schedule, count: schedule.length });
  } catch (error: any) {
    console.error('Failed to get user schedule:', error);
    return errorResponse(c, 'Failed to fetch user schedule', 500);
  }
});

/**
 * GET /schedule/formatted
 * Get user's schedule formatted by day of week
 */
app.get('/schedule/formatted', protect, async (c) => {
  const user = c.get('user');

  try {
    const schedule = await sectionsService.getUserSchedule(user.id);

    // Format by day of week
    const scheduleByDay: Record<string, any[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    };

    for (const item of schedule) {
      for (const timing of item.schedule) {
        scheduleByDay[timing.dayOfWeek].push({
          courseCode: item.courseCode,
          courseName: item.courseName,
          sectionType: item.sectionType,
          sectionNumber: item.sectionNumber,
          instructors: item.instructors,
          roomNumber: item.roomNumber,
          startTime: timing.startTime,
          endTime: timing.endTime,
        });
      }
    }

    // Sort each day by start time
    for (const day in scheduleByDay) {
      scheduleByDay[day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return successResponse(c, { schedule: scheduleByDay });
  } catch (error: any) {
    console.error('Failed to format schedule:', error);
    return errorResponse(c, 'Failed to format user schedule', 500);
  }
});

export default app;

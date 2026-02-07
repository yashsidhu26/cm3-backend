import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { academicsService, type SyncResult } from './academics.service';
import { successResponse, errorResponse, createdResponse } from '../../core/utils/response';
import { protect, requireAdmin } from '../../core/auth/middleware';
import { MoodleError } from './moodle.service';

import moodleRouter from './moodle.router';

/**
 * Academics Module Routes
 * Handles all academic-related endpoints including Moodle sync
 */

const academics = new Hono();

// Mount Moodle routes
academics.route('/moodle', moodleRouter);

/**
 * Validation Schemas
 */

// Moodle sync schema
const moodleSyncSchema = z.object({
  moodleUsername: z.string().min(1, 'Moodle username is required'),
  moodlePassword: z.string().min(1, 'Moodle password is required'),
});

// Create course schema
const createCourseSchema = z.object({
  name: z.string().min(1, 'Course name is required'),
  code: z.string().min(1, 'Course code is required'),
  professorName: z.string().optional(),
  description: z.string().optional(),
  moodleCourseId: z.string().optional(),
  semester: z.enum(['fall', 'spring', 'summer']).optional(),
  year: z.string().optional(),
});

// Create resource schema
const createResourceSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  title: z.string().min(1, 'Resource title is required'),
  url: z.string().url('Invalid URL'),
  type: z.enum(['pdf', 'slide', 'video', 'link', 'assignment', 'other']),
  fileSize: z.string().optional(),
});

// Enrollment schema
const enrollmentSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  courseId: z.string().uuid('Invalid course ID'),
  semester: z.enum(['fall', 'spring', 'summer']).optional(),
  year: z.string().optional(),
});

/**
 * POST /sync
 * Sync user's Moodle data
 * Requires authentication
 */
academics.post('/sync', protect, zValidator('json', moodleSyncSchema), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401);
    }

    const { moodleUsername, moodlePassword } = c.req.valid('json');

    console.log(`[API] Starting Moodle sync for user: ${user.id}`);

    // Trigger sync
    const result: SyncResult = await academicsService.syncUserData(
      user.id,
      moodleUsername,
      moodlePassword
    );

    if (!result.success && result.errors.length > 0) {
      return errorResponse(
        c,
        'Moodle sync completed with errors',
        207, // Multi-Status
        'SYNC_PARTIAL_FAILURE',
        {
          result,
        }
      );
    }

    return successResponse(c, {
      message: 'Moodle sync completed successfully',
      result: {
        coursesAdded: result.coursesAdded,
        coursesUpdated: result.coursesUpdated,
        enrollmentsCreated: result.enrollmentsCreated,
      },
    });

  } catch (error: any) {
    console.error('[API] Moodle sync failed:', error);

    if (error instanceof MoodleError) {
      return errorResponse(
        c,
        error.message,
        error.statusCode,
        error.code
      );
    }

    return errorResponse(
      c,
      'Failed to sync Moodle data',
      500,
      'SYNC_FAILED',
      { error: error.message }
    );
  }
});

/**
 * GET /my-courses
 * Get authenticated user's courses with resource counts
 * Requires authentication
 */
academics.get('/my-courses', protect, async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401);
    }

    const coursesWithResources = await academicsService.getUserCoursesWithResources(user.id);

    return successResponse(c, {
      courses: coursesWithResources.map((item) => ({
        ...item.course,
        enrollment: item.enrollment,
        resourceCount: item.resourceCount,
      })),
      count: coursesWithResources.length,
    });

  } catch (error) {
    console.error('[API] Error fetching user courses:', error);
    return errorResponse(c, 'Failed to fetch courses', 500);
  }
});

/**
 * GET /courses/:id/resources
 * Get all resources for a specific course
 * Requires authentication
 */
academics.get('/courses/:id/resources', protect, async (c) => {
  try {
    const courseId = c.req.param('id');

    // Verify user is enrolled in the course
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401);
    }

    const userCourses = await academicsService.getUserCourses(user.id);
    const isEnrolled = userCourses.some((item) => item.course.id === courseId);

    if (!isEnrolled) {
      return errorResponse(
        c,
        'You are not enrolled in this course',
        403,
        'NOT_ENROLLED'
      );
    }

    const resources = await academicsService.getCourseResources(courseId);

    return successResponse(c, {
      courseId,
      resources,
      count: resources.length,
    });

  } catch (error) {
    console.error('[API] Error fetching course resources:', error);
    return errorResponse(c, 'Failed to fetch resources', 500);
  }
});

/**
 * GET /courses
 * Retrieve all courses
 * Public endpoint
 */
academics.get('/courses', async (c) => {
  try {
    const courses = await academicsService.getAllCourses();
    return successResponse(c, {
      courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('[API] Error fetching courses:', error);
    return errorResponse(c, 'Failed to fetch courses', 500);
  }
});

/**
 * GET /courses/:id
 * Retrieve a specific course by ID
 * Public endpoint
 */
academics.get('/courses/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const course = await academicsService.getCourseById(id);

    if (!course) {
      return errorResponse(c, 'Course not found', 404, 'COURSE_NOT_FOUND');
    }

    return successResponse(c, { course });
  } catch (error) {
    console.error('[API] Error fetching course:', error);
    return errorResponse(c, 'Failed to fetch course', 500);
  }
});

/**
 * POST /courses
 * Create a new course (Admin only)
 */
academics.post('/courses', requireAdmin, zValidator('json', createCourseSchema), async (c) => {
  try {
    const data = c.req.valid('json');

    const course = await academicsService.createCourse(data);
    return createdResponse(c, { course });
  } catch (error) {
    console.error('[API] Error creating course:', error);
    return errorResponse(c, 'Failed to create course', 500);
  }
});

/**
 * POST /resources
 * Create a new resource (Admin only)
 */
academics.post('/resources', requireAdmin, zValidator('json', createResourceSchema), async (c) => {
  try {
    const data = c.req.valid('json');

    const resource = await academicsService.createResource(data);
    return createdResponse(c, { resource });
  } catch (error) {
    console.error('[API] Error creating resource:', error);
    return errorResponse(c, 'Failed to create resource', 500);
  }
});

/**
 * PATCH /resources/:id/downloaded
 * Mark resource as downloaded
 * Requires authentication
 */
academics.patch('/resources/:id/downloaded', protect, async (c) => {
  try {
    const resourceId = c.req.param('id');

    await academicsService.markResourceDownloaded(resourceId);
    return successResponse(c, { message: 'Resource marked as downloaded' });
  } catch (error) {
    console.error('[API] Error updating resource:', error);
    return errorResponse(c, 'Failed to update resource', 500);
  }
});

/**
 * GET /courses/:id/enrollments
 * Get all enrollments for a course (Admin only)
 */
academics.get('/courses/:id/enrollments', requireAdmin, async (c) => {
  try {
    const courseId = c.req.param('id');
    const enrollments = await academicsService.getCourseEnrollments(courseId);

    return successResponse(c, {
      courseId,
      enrollments,
      count: enrollments.length,
    });
  } catch (error) {
    console.error('[API] Error fetching enrollments:', error);
    return errorResponse(c, 'Failed to fetch enrollments', 500);
  }
});

/**
 * POST /enrollments
 * Enroll a user in a course (Admin only)
 */
academics.post('/enrollments', requireAdmin, zValidator('json', enrollmentSchema), async (c) => {
  try {
    const { userId, courseId, semester, year } = c.req.valid('json');

    const enrollment = await academicsService.enrollUser(userId, courseId, semester);
    return createdResponse(c, { enrollment });
  } catch (error: any) {
    console.error('[API] Error creating enrollment:', error);

    // Handle duplicate enrollment
    if (error?.code === '23505') {
      return errorResponse(c, 'User is already enrolled in this course', 409, 'DUPLICATE_ENROLLMENT');
    }

    return errorResponse(c, 'Failed to create enrollment', 500);
  }
});

/**
 * DELETE /enrollments
 * Unenroll a user from a course (Admin only)
 */
academics.delete('/enrollments', requireAdmin, zValidator('json', enrollmentSchema), async (c) => {
  try {
    const { userId, courseId } = c.req.valid('json');

    await academicsService.unenrollUser(userId, courseId);
    return successResponse(c, { message: 'Enrollment deleted successfully' });
  } catch (error) {
    console.error('[API] Error deleting enrollment:', error);
    return errorResponse(c, 'Failed to delete enrollment', 500);
  }
});

export default academics;

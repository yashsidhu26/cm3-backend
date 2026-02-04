import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { 
  courses, 
  enrollments, 
  resources,
  type Course, 
  type NewCourse, 
  type Enrollment,
  type Resource,
  type NewResource,
} from './academics.schema';
import { user } from '../auth/auth.schema';
import { moodleClient, type MoodleCourse, MoodleError } from './moodle.service';

/**
 * Academics Service
 * Business logic for academic operations and Moodle synchronization
 */

export interface SyncResult {
  success: boolean;
  coursesAdded: number;
  coursesUpdated: number;
  enrollmentsCreated: number;
  errors: string[];
}

export class AcademicsService {
  /**
   * Sync user data from Moodle
   * Orchestrates the entire sync process:
   * 1. Authenticate with Moodle
   * 2. Fetch user's courses
   * 3. Upsert courses in database
   * 4. Create/update enrollments
   * 
   * @param userId - Internal user ID
   * @param moodleUsername - Moodle username (BITS ID)
   * @param moodlePassword - Moodle password
   * @returns Sync result summary
   */
  async syncUserData(
    userId: string,
    moodleUsername: string,
    moodlePassword: string
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      coursesAdded: 0,
      coursesUpdated: 0,
      enrollmentsCreated: 0,
      errors: [],
    };

    try {
      console.log(`[Sync] Starting sync for user: ${userId}`);

      // Step 1: Authenticate with Moodle
      let authResponse;
      try {
        authResponse = await moodleClient.authenticate(moodleUsername, moodlePassword);
      } catch (error: any) {
        if (error instanceof MoodleError) {
          throw new Error(`Moodle authentication failed: ${error.message}`);
        }
        throw error;
      }

      console.log('[Sync] Moodle authentication successful');

      // Step 2: Fetch courses from Moodle
      let moodleCourses: MoodleCourse[];
      try {
        moodleCourses = await moodleClient.fetchCourses(authResponse.token);
      } catch (error: any) {
        if (error instanceof MoodleError) {
          throw new Error(`Failed to fetch Moodle courses: ${error.message}`);
        }
        throw error;
      }

      console.log(`[Sync] Fetched ${moodleCourses.length} courses from Moodle`);

      // Step 3: Process each course
      for (const moodleCourse of moodleCourses) {
        try {
          // Check if course already exists by moodle_course_id
          const existingCourse = await this.getCourseBymoodleId(moodleCourse.id);

          let courseId: string;

          if (existingCourse) {
            // Update existing course
            const updated = await db
              .update(courses)
              .set({
                code: moodleCourse.shortname,
                name: moodleCourse.fullname,
                description: moodleCourse.summary,
                professorName: moodleCourse.teachers?.[0] || null,
                updatedAt: new Date(),
              })
              .where(eq(courses.moodleCourseId, moodleCourse.id))
              .returning();

            courseId = updated[0].id;
            result.coursesUpdated++;
            console.log(`[Sync] Updated course: ${moodleCourse.shortname}`);
          } else {
            // Create new course
            const created = await db
              .insert(courses)
              .values({
                moodleCourseId: moodleCourse.id,
                code: moodleCourse.shortname,
                name: moodleCourse.fullname,
                description: moodleCourse.summary,
                professorName: moodleCourse.teachers?.[0] || null,
              })
              .returning();

            courseId = created[0].id;
            result.coursesAdded++;
            console.log(`[Sync] Created course: ${moodleCourse.shortname}`);
          }

          // Step 4: Create enrollment if doesn't exist
          const existingEnrollment = await db
            .select()
            .from(enrollments)
            .where(
              and(
                eq(enrollments.userId, userId),
                eq(enrollments.courseId, courseId)
              )
            );

          if (existingEnrollment.length === 0) {
            await db.insert(enrollments).values({
              userId,
              courseId,
              semester: 'fall', // Default, can be updated later
            });
            result.enrollmentsCreated++;
            console.log(`[Sync] Created enrollment for course: ${moodleCourse.shortname}`);
          }

          // Step 5: Optionally sync resources (commented out for performance)
          // await this.syncCourseResources(courseId, moodleCourse.id, authResponse.token);

        } catch (error: any) {
          console.error(`[Sync] Error processing course ${moodleCourse.shortname}:`, error);
          result.errors.push(`Failed to process course ${moodleCourse.shortname}: ${error.message}`);
        }
      }

      result.success = result.errors.length === 0;
      console.log('[Sync] Sync completed:', result);

      return result;

    } catch (error: any) {
      console.error('[Sync] Sync failed:', error);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Sync resources for a specific course
   * Fetches and stores course materials (PDFs, slides, etc.)
   */
  async syncCourseResources(courseId: string, moodleCourseId: string, token: string): Promise<void> {
    try {
      const moodleResources = await moodleClient.fetchCourseResources(token, moodleCourseId);

      for (const moodleResource of moodleResources) {
        // Check if resource already exists
        const existing = await db
          .select()
          .from(resources)
          .where(eq(resources.moodleResourceId, moodleResource.id));

        if (existing.length === 0) {
          await db.insert(resources).values({
            courseId,
            title: moodleResource.name,
            url: moodleResource.url,
            type: moodleResource.type,
            fileSize: moodleResource.filesize?.toString(),
            moodleResourceId: moodleResource.id,
            uploadedBy: moodleResource.uploadedby,
          });
        }
      }
    } catch (error) {
      console.error('[Sync] Failed to sync resources:', error);
      // Don't throw - resource sync is optional
    }
  }

  /**
   * Get all courses
   */
  async getAllCourses(): Promise<Course[]> {
    return await db.select().from(courses);
  }

  /**
   * Get course by ID
   */
  async getCourseById(id: string): Promise<Course | undefined> {
    const result = await db.select().from(courses).where(eq(courses.id, id));
    return result[0];
  }

  /**
   * Get course by Moodle ID
   */
  async getCourseBymoodleId(moodleId: string): Promise<Course | undefined> {
    const result = await db.select().from(courses).where(eq(courses.moodleCourseId, moodleId));
    return result[0];
  }

  /**
   * Get course by code
   */
  async getCourseByCode(code: string): Promise<Course | undefined> {
    const result = await db.select().from(courses).where(eq(courses.code, code));
    return result[0];
  }

  /**
   * Create a new course
   */
  async createCourse(data: NewCourse): Promise<Course> {
    const result = await db.insert(courses).values(data).returning();
    return result[0];
  }

  /**
   * Get enrollments for a specific course
   */
  async getCourseEnrollments(courseId: string) {
    return await db
      .select({
        user: user,
        semester: enrollments.semester,
        year: enrollments.year,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(user, eq(enrollments.userId, user.id))
      .where(eq(enrollments.courseId, courseId));
  }

  /**
   * Enroll a user in a course
   */
  async enrollUser(userId: string, courseId: string, semester?: 'fall' | 'spring' | 'summer'): Promise<Enrollment> {
    const result = await db
      .insert(enrollments)
      .values({ userId, courseId, semester: semester || 'fall' })
      .returning();
    return result[0];
  }

  /**
   * Get courses for a specific user with resource counts
   */
  async getUserCoursesWithResources(userId: string) {
    return await db
      .select({
        course: courses,
        enrollment: {
          semester: enrollments.semester,
          year: enrollments.year,
          enrolledAt: enrollments.enrolledAt,
        },
        resourceCount: sql<number>`cast(count(${resources.id}) as integer)`,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .leftJoin(resources, eq(courses.id, resources.courseId))
      .where(eq(enrollments.userId, userId))
      .groupBy(courses.id, enrollments.semester, enrollments.year, enrollments.enrolledAt);
  }

  /**
   * Get courses for a specific user (simple)
   */
  async getUserCourses(userId: string) {
    return await db
      .select({
        course: courses,
        semester: enrollments.semester,
        year: enrollments.year,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.courseId, courses.id))
      .where(eq(enrollments.userId, userId));
  }

  /**
   * Get resources for a specific course
   */
  async getCourseResources(courseId: string): Promise<Resource[]> {
    return await db
      .select()
      .from(resources)
      .where(eq(resources.courseId, courseId));
  }

  /**
   * Create a resource
   */
  async createResource(data: NewResource): Promise<Resource> {
    const result = await db.insert(resources).values(data).returning();
    return result[0];
  }

  /**
   * Mark resource as downloaded
   */
  async markResourceDownloaded(resourceId: string): Promise<void> {
    await db
      .update(resources)
      .set({ isDownloaded: true, updatedAt: new Date() })
      .where(eq(resources.id, resourceId));
  }

  /**
   * Unenroll a user from a course
   */
  async unenrollUser(userId: string, courseId: string): Promise<void> {
    await db
      .delete(enrollments)
      .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
  }

  /**
   * Delete a resource
   */
  async deleteResource(resourceId: string): Promise<void> {
    await db.delete(resources).where(eq(resources.id, resourceId));
  }
}

// Export singleton instance
export const academicsService = new AcademicsService();

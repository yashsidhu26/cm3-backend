import { eq, and, sql, or } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
  courses,
  enrollments,
  resources,
  courseSections,
  classSchedule,
  userSectionRegistrations,
  type Course,
  type NewCourse,
  type Enrollment,
  type Resource,
  type NewResource,
} from './academics.schema';
import { user } from '../auth/auth.schema';
import { moodleClient, type MoodleCourse, MoodleError } from './moodle.service';
import {
  normalizeCourseCode,
  matchCourseCodes,
  extractCourseCodeFromMoodle,
  findBestMatch
} from './course-matcher';

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
   * Sync courses using existing Moodle token
   * More efficient version that doesn't re-authenticate
   * Use this after sign-in when you already have a token
   *
   * @param userId - Internal user ID
   * @param moodleToken - Moodle authentication token
   * @param moodleUserId - Moodle user ID
   * @returns Sync result summary
   */
  async syncCoursesWithToken(
    userId: string,
    moodleToken: string,
    moodleUserId: string
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      coursesAdded: 0,
      coursesUpdated: 0,
      enrollmentsCreated: 0,
      errors: [],
    };

    try {
      console.log(`[Sync] Starting course sync for user: ${userId}`);

      // Fetch courses from Moodle using existing token
      let moodleCourses: MoodleCourse[];
      try {
        moodleCourses = await moodleClient.fetchCourses(moodleToken, moodleUserId);
      } catch (error: any) {
        if (error instanceof MoodleError) {
          throw new Error(`Failed to fetch Moodle courses: ${error.message}`);
        }
        throw error;
      }

      console.log(`[Sync] Fetched ${moodleCourses.length} courses from Moodle`);

      // Process each course
      for (const moodleCourse of moodleCourses) {
        try {
          // 1. Extract course code from Moodle data (try both shortname and fullname)
          const extractedCode = extractCourseCodeFromMoodle(moodleCourse.shortname) ||
                               extractCourseCodeFromMoodle(moodleCourse.fullname);

          console.log(`[Sync] Processing Moodle course: ${moodleCourse.shortname}`);
          if (extractedCode) {
            console.log(`[Sync]   Extracted code: ${extractedCode}`);
          }

          // 2. Check if course already exists by moodle_course_id (already linked)
          let existingCourse = await this.getCourseBymoodleId(moodleCourse.id);

          // 3. If not linked to Moodle yet, search for matching BITS catalog course
          if (!existingCourse && extractedCode) {
            // First try exact normalized match (fastest)
            const normalizedExtracted = normalizeCourseCode(extractedCode);
            const allCourses = await db.select().from(courses);

            existingCourse = allCourses.find(c =>
              c.code && normalizeCourseCode(c.code) === normalizedExtracted
            );

            // If no exact match, try fuzzy matching
            if (!existingCourse) {
              const match = findBestMatch(
                extractedCode,
                allCourses.map(c => ({ code: c.code, name: c.name })),
                0.8 // 80% similarity threshold for reliable matching
              );

              if (match) {
                console.log(`[Sync]   Found fuzzy match: ${match.course.code} (score: ${match.score.toFixed(2)})`);
                existingCourse = allCourses.find(c => c.code === match.course.code);
              }
            } else {
              console.log(`[Sync]   Found exact match: ${existingCourse.code}`);
            }
          }

          let courseId: string;

          if (existingCourse) {
            // Update existing course with Moodle data, preserving BITS catalog fields
            const updateData: any = {
              moodleCourseId: moodleCourse.id,
              updatedAt: new Date(),
            };

            // Only update description if we don't have one or Moodle has better info
            if (!existingCourse.description && moodleCourse.summary) {
              updateData.description = moodleCourse.summary;
            }

            // Update professor if available and not set
            if (moodleCourse.teachers?.[0] && !existingCourse.professorName) {
              updateData.professorName = moodleCourse.teachers[0];
            }

            // DON'T overwrite: name, code, staticId, units, courseType, nickname, handoutLink
            // These come from BITS catalog and should be preserved

            const updated = await db
              .update(courses)
              .set(updateData)
              .where(eq(courses.id, existingCourse.id))
              .returning();

            courseId = updated[0].id;
            result.coursesUpdated++;
            console.log(`[Sync]   Linked Moodle course to existing: ${existingCourse.code} (preserved: staticId=${!!existingCourse.staticId}, handoutLink=${!!existingCourse.handoutLink})`);
          } else {
            // Create new course from Moodle data
            // This happens when course is not in BITS catalog (maybe a special course, project, etc.)
            const created = await db
              .insert(courses)
              .values({
                moodleCourseId: moodleCourse.id,
                code: extractedCode || moodleCourse.shortname,
                name: moodleCourse.fullname,
                description: moodleCourse.summary,
                professorName: moodleCourse.teachers?.[0] || null,
              })
              .returning();

            courseId = created[0].id;
            result.coursesAdded++;
            console.log(`[Sync]   Created new course (not in BITS catalog): ${moodleCourse.shortname}`);
          }

          // Create enrollment if doesn't exist
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

          // Sync resources for each course
          await this.syncCourseResources(courseId, moodleCourse.id, moodleToken);

        } catch (error: any) {
          console.error(`[Sync] Error processing course ${moodleCourse.shortname}:`, error);
          result.errors.push(`Failed to process course ${moodleCourse.shortname}: ${error.message}`);
        }
      }

      result.success = result.errors.length === 0;
      console.log('[Sync] Course sync completed:', result);

      return result;

    } catch (error: any) {
      console.error('[Sync] Course sync failed:', error);
      result.errors.push(error.message);
      return result;
    }
  }

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

      // Step 2: Use the token-based sync function
      return await this.syncCoursesWithToken(userId, authResponse.token, authResponse.userId);

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
   * Get courses with full details including sections, schedules, and resources
   * Enhanced version for /my-courses endpoint
   */
  async getUserCoursesWithFullDetails(userId: string) {
    // Get courses with resource counts
    const coursesWithResources = await this.getUserCoursesWithResources(userId);

    // For each course, fetch sections with their schedules and user registrations
    const coursesWithDetails = await Promise.all(
      coursesWithResources.map(async (item) => {
        const courseId = item.course.id;

        // Get all sections for this course
        const sections = await db
          .select()
          .from(courseSections)
          .where(eq(courseSections.courseId, courseId));

        // For each section, get schedules and check if user is registered
        const sectionsWithDetails = await Promise.all(
          sections.map(async (section) => {
            // Get schedules for this section
            const schedules = await db
              .select()
              .from(classSchedule)
              .where(eq(classSchedule.sectionId, section.id));

            // Check if user is registered for this section
            const registration = await db
              .select()
              .from(userSectionRegistrations)
              .where(
                and(
                  eq(userSectionRegistrations.userId, userId),
                  eq(userSectionRegistrations.sectionId, section.id)
                )
              );

            return {
              ...section,
              schedules,
              isRegistered: registration.length > 0,
            };
          })
        );

        return {
          ...item.course,
          enrollment: item.enrollment,
          resourceCount: item.resourceCount,
          sections: sectionsWithDetails,
        };
      })
    );

    return coursesWithDetails;
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

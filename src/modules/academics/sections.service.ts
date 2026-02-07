/**
 * Sections Service
 * Manages course sections, schedules, and user registrations
 */

import { db } from '../../core/database/client';
import {
  courseSections,
  classSchedule,
  userSectionRegistrations,
  courses,
  enrollments,
  type CourseSection,
  type NewCourseSection,
  type ClassSchedule,
  type NewClassSchedule,
  type UserSectionRegistration,
} from './academics.schema';
import { eq, and } from 'drizzle-orm';
import { studyDeckService, type ParsedSectionDetail } from './studydeck.service';

export interface SectionWithSchedule extends CourseSection {
  schedule: ClassSchedule[];
}

export interface UserSchedule {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionType: string;
  sectionNumber: number;
  instructors: string[];
  roomNumber: string | null;
  schedule: ClassSchedule[];
}

/**
 * Sections Service Class
 */
export class SectionsService {
  /**
   * Sync course sections from StudyDeck API to database
   *
   * @param courseId - Internal course ID (UUID)
   * @param staticId - Course static ID from all_courses.json
   * @param jwtToken - Optional StudyDeck JWT token (uses env token if not provided)
   * @returns Number of sections synced
   */
  async syncCourseSections(
    courseId: string,
    staticId: string,
    jwtToken?: string
  ): Promise<number> {
    try {
      console.log(`[Sections] Syncing sections for course: ${courseId}`);

      // Fetch sections from StudyDeck
      const sections = await studyDeckService.getCourseSections(staticId, jwtToken);

      let syncedCount = 0;

      for (const section of sections) {
        // Check if section already exists
        const existing = await db
          .select()
          .from(courseSections)
          .where(
            and(
              eq(courseSections.courseId, courseId),
              eq(courseSections.sectionType, section.sectionType),
              eq(courseSections.sectionNumber, section.sectionNumber)
            )
          )
          .limit(1);

        let sectionId: string;

        if (existing.length > 0) {
          // Update existing section
          const updated = await db
            .update(courseSections)
            .set({
              instructors: section.instructors,
              roomNumber: section.roomNumber || null,
              updatedAt: new Date(),
            })
            .where(eq(courseSections.id, existing[0].id))
            .returning();

          sectionId = updated[0].id;

          // Delete old schedule
          await db
            .delete(classSchedule)
            .where(eq(classSchedule.sectionId, sectionId));
        } else {
          // Create new section
          const created = await db
            .insert(courseSections)
            .values({
              courseId,
              sectionType: section.sectionType,
              sectionNumber: section.sectionNumber,
              instructors: section.instructors,
              roomNumber: section.roomNumber || null,
            })
            .returning();

          sectionId = created[0].id;
        }

        // Insert schedule for this section
        for (const timing of section.timings) {
          await db.insert(classSchedule).values({
            sectionId,
            dayOfWeek: timing.dayOfWeek,
            startTime: timing.startTime,
            endTime: timing.endTime,
          });
        }

        syncedCount++;
      }

      console.log(`[Sections] Synced ${syncedCount} sections`);
      return syncedCount;

    } catch (error: any) {
      console.error('[Sections] Failed to sync sections:', error);
      throw error;
    }
  }

  /**
   * Get all sections for a course with schedule
   *
   * @param courseId - Internal course ID
   * @returns List of sections with schedule
   */
  async getCourseSections(courseId: string): Promise<SectionWithSchedule[]> {
    const sections = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId));

    const sectionsWithSchedule: SectionWithSchedule[] = [];

    for (const section of sections) {
      const schedule = await db
        .select()
        .from(classSchedule)
        .where(eq(classSchedule.sectionId, section.id));

      sectionsWithSchedule.push({
        ...section,
        schedule,
      });
    }

    return sectionsWithSchedule;
  }

  /**
   * Register user for a section
   *
   * @param userId - User ID
   * @param sectionId - Section ID
   */
  async registerUserForSection(userId: string, sectionId: string): Promise<void> {
    // Check if already registered
    const existing = await db
      .select()
      .from(userSectionRegistrations)
      .where(
        and(
          eq(userSectionRegistrations.userId, userId),
          eq(userSectionRegistrations.sectionId, sectionId)
        )
      );

    if (existing.length === 0) {
      await db.insert(userSectionRegistrations).values({
        userId,
        sectionId,
      });
    }
  }

  /**
   * Unregister user from a section
   *
   * @param userId - User ID
   * @param sectionId - Section ID
   */
  async unregisterUserFromSection(userId: string, sectionId: string): Promise<void> {
    await db
      .delete(userSectionRegistrations)
      .where(
        and(
          eq(userSectionRegistrations.userId, userId),
          eq(userSectionRegistrations.sectionId, sectionId)
        )
      );
  }

  /**
   * Get user's registered sections (their schedule)
   *
   * @param userId - User ID
   * @returns List of registered sections with details
   */
  async getUserSchedule(userId: string): Promise<UserSchedule[]> {
    const registrations = await db
      .select()
      .from(userSectionRegistrations)
      .where(eq(userSectionRegistrations.userId, userId));

    const schedule: UserSchedule[] = [];

    for (const registration of registrations) {
      // Get section details
      const section = await db
        .select()
        .from(courseSections)
        .where(eq(courseSections.id, registration.sectionId))
        .limit(1);

      if (section.length === 0) continue;

      // Get course details
      const course = await db
        .select()
        .from(courses)
        .where(eq(courses.id, section[0].courseId))
        .limit(1);

      if (course.length === 0) continue;

      // Get schedule
      const timings = await db
        .select()
        .from(classSchedule)
        .where(eq(classSchedule.sectionId, section[0].id));

      schedule.push({
        sectionId: section[0].id,
        courseCode: course[0].code,
        courseName: course[0].name,
        sectionType: section[0].sectionType,
        sectionNumber: section[0].sectionNumber,
        instructors: section[0].instructors || [],
        roomNumber: section[0].roomNumber,
        schedule: timings,
      });
    }

    return schedule;
  }

  /**
   * Get sections user is registered for a specific course
   *
   * @param userId - User ID
   * @param courseId - Course ID
   * @returns List of registered section IDs
   */
  async getUserRegisteredSections(userId: string, courseId: string): Promise<string[]> {
    // Get all sections for this course
    const courseSectionsList = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId));

    const sectionIds = courseSectionsList.map(s => s.id);

    if (sectionIds.length === 0) return [];

    // Get user's registrations for these sections
    const registrations = await db
      .select()
      .from(userSectionRegistrations)
      .where(eq(userSectionRegistrations.userId, userId));

    const registeredSectionIds = registrations
      .filter(r => sectionIds.includes(r.sectionId))
      .map(r => r.sectionId);

    return registeredSectionIds;
  }

  /**
   * Bulk register user for multiple sections
   *
   * @param userId - User ID
   * @param sectionIds - Array of section IDs
   */
  async bulkRegisterSections(userId: string, sectionIds: string[]): Promise<void> {
    for (const sectionId of sectionIds) {
      await this.registerUserForSection(userId, sectionId);
    }
  }

  /**
   * Replace user's registrations for a course
   * Unregisters from all old sections and registers for new ones
   *
   * @param userId - User ID
   * @param courseId - Course ID
   * @param newSectionIds - New section IDs to register
   */
  async replaceUserSections(
    userId: string,
    courseId: string,
    newSectionIds: string[]
  ): Promise<void> {
    // Get all sections for this course
    const courseSectionsList = await db
      .select()
      .from(courseSections)
      .where(eq(courseSections.courseId, courseId));

    const allSectionIds = courseSectionsList.map(s => s.id);

    // Unregister from all course sections
    for (const sectionId of allSectionIds) {
      await this.unregisterUserFromSection(userId, sectionId);
    }

    // Register for new sections
    await this.bulkRegisterSections(userId, newSectionIds);
  }

  /**
   * Auto-sync sections for all user's enrolled courses
   * Only syncs courses that have a staticId
   * Uses STUDYDECK_JWT_TOKEN from environment
   *
   * @param userId - User ID
   * @returns Summary of sync results
   */
  async autoSyncAllCourses(
    userId: string
  ): Promise<{
    totalCourses: number;
    syncedCourses: number;
    skippedCourses: number;
    errors: string[];
  }> {
    const result = {
      totalCourses: 0,
      syncedCourses: 0,
      skippedCourses: 0,
      errors: [] as string[],
    };

    try {
      console.log(`[Sections] Auto-syncing sections for user: ${userId}`);

      // Get user's enrolled courses
      const userEnrollments = await db
        .select()
        .from(courses)
        .innerJoin(
          enrollments,
          eq(enrollments.courseId, courses.id)
        )
        .where(eq(enrollments.userId, userId));

      result.totalCourses = userEnrollments.length;

      for (const enrollment of userEnrollments) {
        const course = enrollment.courses;

        // Skip courses without staticId
        if (!course.staticId) {
          console.log(`[Sections] Skipping course ${course.code} (no staticId)`);
          result.skippedCourses++;
          continue;
        }

        try {
          await this.syncCourseSections(course.id, course.staticId);
          result.syncedCourses++;
          console.log(`[Sections] Synced sections for ${course.code}`);
        } catch (error: any) {
          console.error(`[Sections] Failed to sync ${course.code}:`, error.message);
          result.errors.push(`${course.code}: ${error.message}`);
        }
      }

      console.log(`[Sections] Auto-sync completed: ${result.syncedCourses}/${result.totalCourses} courses`);
      return result;

    } catch (error: any) {
      console.error('[Sections] Auto-sync failed:', error);
      result.errors.push(`Fatal error: ${error.message}`);
      return result;
    }
  }
}

// Export singleton instance
export const sectionsService = new SectionsService();

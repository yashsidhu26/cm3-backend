import { eq, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import type { ContextType, StudentContext } from './types';
import { studentProfileService } from '../student-profile/student-profile.service';
import { academicsService } from '../academics/academics.service';
import {
  activityLogs,
  studentExperiences,
  studentCommitments,
} from '../student-profile/student-profile.schema';

export class ContextFetcherService {
  /**
   * Fetch student context based on needed context types
   * Fetches data in parallel where possible for performance
   */
  async fetchContext(
    userId: string,
    neededContext: ContextType[]
  ): Promise<StudentContext> {
    const context: StudentContext = {};

    // Create array of promises for parallel fetching
    const fetchPromises: Promise<void>[] = [];

    // Profile and academics come from dashboard (can fetch together)
    if (
      neededContext.includes('profile') ||
      neededContext.includes('academics')
    ) {
      fetchPromises.push(
        this.fetchDashboardData(userId, neededContext, context)
      );
    }

    // Courses and course resources
    if (neededContext.includes('courses')) {
      fetchPromises.push(this.fetchCourses(userId, context));
    }

    if (neededContext.includes('course_resources')) {
      fetchPromises.push(this.fetchCourseResources(userId, context));
    }

    // Smart study plan
    if (neededContext.includes('smart_plan')) {
      fetchPromises.push(this.fetchSmartPlan(userId, context));
    }

    // Activity logs
    if (neededContext.includes('activity_logs')) {
      fetchPromises.push(this.fetchActivityLogs(userId, context));
    }

    // Experiences
    if (neededContext.includes('experiences')) {
      fetchPromises.push(this.fetchExperiences(userId, context));
    }

    // Commitments
    if (neededContext.includes('commitments')) {
      fetchPromises.push(this.fetchCommitments(userId, context));
    }

    // Wait for all fetches to complete
    await Promise.allSettled(fetchPromises);

    return context;
  }

  private async fetchDashboardData(
    userId: string,
    neededContext: ContextType[],
    context: StudentContext
  ): Promise<void> {
    try {
      const dashboard = await studentProfileService.getDashboardData(userId);

      if (neededContext.includes('profile')) {
        context.profile = {
          ...dashboard.profile,
          behavioralInsights: dashboard.behavioralInsights,
        };
      }

      if (neededContext.includes('academics')) {
        context.academics = {
          ...dashboard.academics,
          gapAnalysis: dashboard.gapAnalysis,
        };
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Continue with empty data rather than failing
    }
  }

  private async fetchCourses(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      const coursesData = await academicsService.getUserCoursesWithResources(userId);
      context.courses = coursesData;
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      context.courses = [];
    }
  }

  private async fetchCourseResources(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      // First get user's courses
      const coursesData = await academicsService.getUserCoursesWithResources(userId);

      // Fetch resources for each course in parallel
      const resourcePromises = coursesData.map(async (course) => {
        try {
          const resources = await academicsService.getCourseResources(course.id);
          return { courseId: course.id, courseName: course.name, resources };
        } catch (error) {
          console.error(`Failed to fetch resources for course ${course.id}:`, error);
          return { courseId: course.id, courseName: course.name, resources: [] };
        }
      });

      const resourceResults = await Promise.all(resourcePromises);

      // Build resource map
      context.courseResources = {};
      for (const result of resourceResults) {
        context.courseResources[result.courseId] = result.resources;
      }
    } catch (error) {
      console.error('Failed to fetch course resources:', error);
      context.courseResources = {};
    }
  }

  private async fetchSmartPlan(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      const plan = await studentProfileService.getSmartStudyPlan(userId);
      context.smartPlan = plan;
    } catch (error) {
      console.error('Failed to fetch smart study plan:', error);
    }
  }

  private async fetchActivityLogs(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      const logs = await db.query.activityLogs.findMany({
        where: eq(activityLogs.userId, userId),
        orderBy: [desc(activityLogs.timestamp)],
        limit: 50, // Last 50 activities
      });
      context.activityLogs = logs;
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
      context.activityLogs = [];
    }
  }

  private async fetchExperiences(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      const experiences = await db.query.studentExperiences.findMany({
        where: eq(studentExperiences.userId, userId),
        orderBy: [desc(studentExperiences.startDate)],
      });
      context.experiences = experiences;
    } catch (error) {
      console.error('Failed to fetch experiences:', error);
      context.experiences = [];
    }
  }

  private async fetchCommitments(
    userId: string,
    context: StudentContext
  ): Promise<void> {
    try {
      const commitments = await db.query.studentCommitments.findMany({
        where: eq(studentCommitments.userId, userId),
      });
      context.commitments = commitments;
    } catch (error) {
      console.error('Failed to fetch commitments:', error);
      context.commitments = [];
    }
  }
}

export const contextFetcherService = new ContextFetcherService();

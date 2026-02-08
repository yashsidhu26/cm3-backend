/**
 * Tool Registry and Dispatcher
 * Maps tool names to their handler functions
 */

import { academicsService } from '../../../modules/academics/academics.service';
import { sectionsService } from '../../../modules/academics/sections.service';
import { studentProfileService } from '../../../modules/student-profile/student-profile.service';
import { db } from '../../../core/database/client';
import { eq, desc } from 'drizzle-orm';
import type { ToolExecutionResult } from './types';

// Import schemas for DB queries
import {
  activityLogs,
  studentExperiences,
  studentCommitments,
} from '../../../modules/student-profile/student-profile.schema';

type ToolHandler = (args: Record<string, any>, userId: string) => Promise<any>;

/**
 * Tool handler map - each tool mapped to its execution function
 */
const toolHandlers: Record<string, ToolHandler> = {
  // === ACADEMICS ===
  get_enrolled_courses: async (_args, userId) => {
    return await academicsService.getUserCoursesWithResources(userId);
  },

  get_courses_full_details: async (_args, userId) => {
    return await academicsService.getUserCoursesWithFullDetails(userId);
  },

  get_course_resources: async (args, _userId) => {
    return await academicsService.getCourseResources(args.courseId);
  },

  get_course_by_code: async (args, _userId) => {
    const course = await academicsService.getCourseByCode(args.code);
    return course || { message: `Course ${args.code} not found` };
  },

  search_all_courses: async (_args, _userId) => {
    const allCourses = await academicsService.getAllCourses();
    // Limit to first 50 to avoid huge responses
    const limited = allCourses.slice(0, 50);
    return {
      courses: limited,
      total: allCourses.length,
      showing: limited.length,
      note:
        allCourses.length > 50
          ? `Showing first 50 of ${allCourses.length} total courses`
          : undefined,
    };
  },

  // === SCHEDULE ===
  get_class_schedule: async (_args, userId) => {
    return await sectionsService.getUserSchedule(userId);
  },

  get_course_sections: async (args, _userId) => {
    return await sectionsService.getCourseSections(args.courseId);
  },

  // === STUDENT PROFILE ===
  get_dashboard: async (_args, userId) => {
    return await studentProfileService.getDashboardData(userId);
  },

  get_study_plan: async (_args, userId) => {
    return await studentProfileService.getSmartStudyPlan(userId);
  },

  get_behavior_analysis: async (_args, userId) => {
    return await studentProfileService.analyzeBehavior(userId);
  },

  // === ACTIVITY & EXPERIENCE ===
  get_activity_logs: async (args, userId) => {
    const limit = args.limit || 50;
    const logs = await db.query.activityLogs.findMany({
      where: eq(activityLogs.userId, userId),
      orderBy: desc(activityLogs.scheduledTime),
      limit: Math.min(limit, 100), // Cap at 100
    });
    return logs;
  },

  get_experiences: async (_args, userId) => {
    const experiences = await db.query.studentExperiences.findMany({
      where: eq(studentExperiences.userId, userId),
      orderBy: desc(studentExperiences.startDate),
    });
    return experiences;
  },

  get_commitments: async (_args, userId) => {
    const commitments = await db.query.studentCommitments.findMany({
      where: eq(studentCommitments.userId, userId),
    });
    return commitments;
  },

  // === SOCIAL ===
  get_user_tasks: async (_args, userId) => {
    // Query tasks where user is assigned across all their groups
    // This requires joining through group membership
    const tasks = await db.query.tasks.findMany({
      where: eq((await import('../../social/social.schema')).tasks.assignedTo, userId),
      limit: 50,
    });
    return tasks;
  },

  // === MOODLE ===
  get_moodle_notifications: async (_args, userId) => {
    try {
      // Import Moodle services
      const { getMoodleToken, getMoodleUserId } = await import(
        '../../academics/moodle-auth.service'
      );
      const { moodleClient } = await import('../../academics/moodle.service');

      const token = await getMoodleToken(userId);
      const moodleUserId = await getMoodleUserId(userId);

      if (!token || !moodleUserId) {
        return {
          data: null,
          message: 'Moodle not connected. User needs to sign in to Moodle first.',
        };
      }

      const notifications = await moodleClient.fetchNotifications(token, moodleUserId);
      return notifications.slice(0, 20); // Limit to 20 most recent
    } catch (error: any) {
      return {
        error: 'Failed to fetch Moodle notifications',
        message: error.message,
      };
    }
  },

  // === PDF ANALYSIS ===
  analyze_course_handout: async (args, userId) => {
    try {
      const { VertexAI } = await import('@google-cloud/vertexai');

      // Get course by code
      const course = await academicsService.getCourseByCode(args.courseCode);

      if (!course) {
        return {
          error: `Course ${args.courseCode} not found`,
          message: 'Course not found in your enrolled courses',
        };
      }

      // Get handout URL
      const handoutUrl = course.handoutLink;

      if (!handoutUrl) {
        return {
          error: 'No handout available',
          message: `Course ${args.courseCode} (${course.name}) doesn't have a handout link`,
        };
      }

      console.log(`[analyze_course_handout] Downloading handout from: ${handoutUrl}`);

      // Download PDF
      const response = await fetch(handoutUrl);

      if (!response.ok) {
        return {
          error: 'Failed to download handout',
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      console.log(`[analyze_course_handout] Downloaded ${buffer.byteLength} bytes`);

      // Initialize Vertex AI
      const projectId = process.env.GCP_PROJECT_ID;
      const location = process.env.GCP_LOCATION || 'us-central1';

      if (!projectId) {
        return {
          error: 'GCP_PROJECT_ID not configured',
          message: 'Google Cloud project ID is required for PDF analysis',
        };
      }

      const vertexAI = new VertexAI({ project: projectId, location });

      console.log(`[analyze_course_handout] Analyzing with Vertex AI...`);

      // Use gemini-1.5-pro for PDF analysis (better multimodal capabilities)
      const model = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-pro-002',
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data,
          },
        },
        {
          text: `Analyze this course handout and provide a comprehensive summary. Include:
1. Course overview and objectives
2. Topics covered
3. Grading scheme (if mentioned)
4. Important policies
5. Key dates or deadlines (if any)
6. Any other important information

Be thorough but concise.`,
        },
      ]);

      const analysisText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!analysisText) {
        return {
          error: 'Empty analysis response',
          message: 'Gemini returned an empty analysis',
        };
      }

      console.log(`[analyze_course_handout] Analysis complete`);

      return {
        course: {
          code: course.code,
          name: course.name,
        },
        handoutUrl,
        analysis: analysisText,
      };
    } catch (error: any) {
      console.error('[analyze_course_handout] Error:', error);
      return {
        error: 'Failed to analyze handout',
        message: error.message || 'Unknown error',
      };
    }
  },
};

/**
 * Execute a tool call with timeout and error handling
 */
export async function executeToolCall(
  name: string,
  args: Record<string, any>,
  userId: string
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // Check if tool exists
  const handler = toolHandlers[name];
  if (!handler) {
    return {
      name,
      response: {
        error: `Unknown tool: ${name}`,
      },
    };
  }

  try {
    // Longer timeout for PDF analysis (30s), normal timeout for others (10s)
    const timeout = name === 'analyze_course_handout' ? 30000 : 10000;

    const result = await Promise.race([
      handler(args, userId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timeout (${timeout / 1000}s)`)), timeout)
      ),
    ]);

    return {
      name,
      response: {
        success: true,
        data: result,
      },
    };
  } catch (error: any) {
    console.error(`[Tool ${name}] Execution failed:`, error);
    return {
      name,
      response: {
        error: error.message || 'Tool execution failed',
      },
    };
  }
}

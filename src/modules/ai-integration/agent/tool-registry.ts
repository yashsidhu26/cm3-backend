/**
 * Tool Registry and Dispatcher
 * Maps tool names to their handler functions
 */

import { academicsService } from '../../../modules/academics/academics.service';
import { sectionsService } from '../../../modules/academics/sections.service';
import { studentProfileService } from '../../../modules/student-profile/student-profile.service';
import { skillsInterestsService } from '../../../modules/skills-interests/skills-interests.service';
import { smartScheduleService } from '../../../modules/smart-schedule/smart-schedule.service';
import { db } from '../../../core/database/client';
import { eq, desc, and } from 'drizzle-orm';
import type { ToolExecutionResult } from './types';
import { aiConversations } from '../ai-integration.schema';

// Import schemas for DB queries
import {
  activityLogs,
  studentExperiences,
  studentCommitments,
  schedules,
  scheduleItems,
} from '../../../modules/student-profile/student-profile.schema';

type ToolHandler = (args: Record<string, any>, userId: string) => Promise<any>;

/**
 * Tool handler map - each tool mapped to its execution function
 */
const toolHandlers: Record<string, ToolHandler> = {
  // === ACADEMICS ===
  get_enrolled_courses: async (_args, userId) => {
    const courses = await academicsService.getUserCoursesWithResources(userId);
    return courses.map((item) => ({
      course: {
        id: item.course?.id,
        code: item.course?.code,
        name: item.course?.name,
      },
      enrollment: {
        semester: item.enrollment?.semester,
        year: item.enrollment?.year,
        enrolledAt: item.enrollment?.enrolledAt,
      },
      resourceCount: item.resourceCount,
    }));
  },

  get_courses_full_details: async (_args, userId) => {
    return await academicsService.getUserCoursesWithFullDetails(userId);
  },

  get_course_resources: async (args, userId) => {
    // Get resources from DB
    const resources = await academicsService.getCourseResources(args.courseId);

    // Get user's Moodle token to append to URLs
    let moodleToken: string | null = null;
    try {
      const { getMoodleToken } = await import('../../academics/moodle-auth.service');
      moodleToken = await getMoodleToken(userId);
    } catch (error) {
      console.warn('[get_course_resources] Could not get Moodle token:', error);
    }

    // Map database schema (title, url) to expected format (name, fileUrl)
    return resources.map((resource) => {
      let fileUrl = resource.url;

      // Append Moodle token if available and not already in URL
      if (moodleToken && fileUrl && !fileUrl.includes('token=')) {
        const separator = fileUrl.includes('?') ? '&' : '?';
        fileUrl = `${fileUrl}${separator}token=${moodleToken}`;
      }

      return {
        ...resource,
        name: resource.title,      // Map title -> name
        fileUrl: fileUrl,           // Map url -> fileUrl (with token)
        type: resource.type,
      };
    });
  },

  get_course_full_details: async (args, userId) => {
    if (!args.code) {
      return { message: 'Course code is required' };
    }
    const course = await academicsService.getCourseByCode(args.code);
    if (!course) {
      return { message: `Course ${args.code} not found` };
    }

    // Get resources from DB
    const resources = await academicsService.getCourseResources(course.id);

    // Get user's Moodle token to append to URLs
    let moodleToken: string | null = null;
    try {
      const { getMoodleToken } = await import('../../academics/moodle-auth.service');
      moodleToken = await getMoodleToken(userId);
    } catch (error) {
      console.warn('[get_course_full_details] Could not get Moodle token:', error);
    }

    const mappedResources = resources
      .slice()
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .map((resource) => {
        let fileUrl = resource.url;
        if (moodleToken && fileUrl && !fileUrl.includes('token=')) {
          const separator = fileUrl.includes('?') ? '&' : '?';
          fileUrl = `${fileUrl}${separator}token=${moodleToken}`;
        }

        return {
          id: resource.id,
          name: resource.title,
          fileUrl,
          type: resource.type,
          createdAt: resource.createdAt,
        };
      });

    return {
      id: course.id,
      code: course.code,
      name: course.name,
      resources: mappedResources,
    };
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

  get_user_course_progress: async (args, userId) => {
    const status = args.status as string | undefined;
    return await academicsService.getUserCourseProgress(userId, status);
  },

  update_course_progress: async (args, userId) => {
    let courseId = args.courseId as string | undefined;

    if (!courseId && args.courseCode) {
      const course = await academicsService.getCourseByCode(args.courseCode);
      if (!course) {
        return { error: `Course ${args.courseCode} not found` };
      }
      courseId = course.id;
    }

    if (!courseId) {
      return { error: 'courseId or courseCode is required' };
    }

    return await academicsService.updateUserCourseProgress(userId, courseId, {
      status: args.status,
      progress: args.progress,
      notes: args.notes,
    });
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

  // === SMART SCHEDULE ===
  get_user_schedules: async (_args, userId) => {
    return await db
      .select({
        id: schedules.id,
        name: schedules.name,
        isActive: schedules.isActive,
        createdAt: schedules.createdAt,
        updatedAt: schedules.updatedAt,
      })
      .from(schedules)
      .where(eq(schedules.userId, userId))
      .orderBy(desc(schedules.isActive), desc(schedules.createdAt));
  },

  get_schedule_details: async (args, userId) => {
    const scheduleId = args.scheduleId as string;
    const [schedule] = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId)))
      .limit(1);

    if (!schedule) {
      return { error: 'Schedule not found' };
    }

    const items = await db
      .select()
      .from(scheduleItems)
      .where(eq(scheduleItems.scheduleId, scheduleId))
      .orderBy(scheduleItems.startDateTime);

    return { ...schedule, items };
  },

  optimize_day_schedule: async (args, userId) => {
    return await smartScheduleService.optimizeDay(userId, args as any);
  },

  edit_smart_schedule: async (args, userId) => {
    return await smartScheduleService.editSchedule(userId, args as any);
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

  get_conversation_history: async (args, userId) => {
    const requestedLimit = Number(args.limit ?? 5);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 5;

    const messages = await db.query.aiConversations.findMany({
      where: eq(aiConversations.userId, userId),
      orderBy: desc(aiConversations.createdAt),
      limit,
    });

    // Return chronological order for easier model consumption.
    return messages.reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      source: msg.source,
    }));
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
      const location = 'global';
      const apiEndpoint = 'aiplatform.googleapis.com';

      if (!projectId) {
        return {
          error: 'GCP_PROJECT_ID not configured',
          message: 'Google Cloud project ID is required for PDF analysis',
        };
      }

      const vertexAI = new VertexAI({ project: projectId, location, apiEndpoint });

      console.log(`[analyze_course_handout] Analyzing with Vertex AI...`);

      // Use gemini-3-flash-preview for PDF analysis (single-model strategy)
      const model = vertexAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
      });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
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
            ],
          },
        ],
      });

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

  // === PDF ANALYSIS - GENERIC ===
  analyze_pdf_document: async (args, userId) => {
    try {
      const { VertexAI } = await import('@google-cloud/vertexai');

      const pdfUrl = args.pdfUrl;
      const documentName = args.documentName || 'Document';

      console.log(`[analyze_pdf_document] Analyzing: ${documentName}`);
      console.log(`[analyze_pdf_document] URL: ${pdfUrl}`);

      // Download PDF
      const response = await fetch(pdfUrl);

      if (!response.ok) {
        return {
          error: 'Failed to download PDF',
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      console.log(`[analyze_pdf_document] Downloaded ${buffer.byteLength} bytes`);

      // Initialize Vertex AI
      const projectId = process.env.GCP_PROJECT_ID;
      const location = 'global';
      const apiEndpoint = 'aiplatform.googleapis.com';

      if (!projectId) {
        return {
          error: 'GCP_PROJECT_ID not configured',
          message: 'Google Cloud project ID is required for PDF analysis',
        };
      }

      const vertexAI = new VertexAI({ project: projectId, location, apiEndpoint });

      console.log(`[analyze_pdf_document] Analyzing with Vertex AI...`);

      // Use gemini-3-flash-preview for PDF analysis (single-model strategy)
      const model = vertexAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
      });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: base64Data,
                },
              },
              {
                text: `Analyze this document: "${documentName}"

Provide a comprehensive summary including:
1. Main topics covered
2. Key concepts and definitions
3. Important points or takeaways
4. Any examples or case studies mentioned
5. Diagrams or figures (describe them)

Be thorough and specific. Format in a clear, organized way.`,
              },
            ],
          },
        ],
      });

      const analysisText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!analysisText) {
        return {
          error: 'Empty analysis response',
          message: 'Gemini returned an empty analysis',
        };
      }

      console.log(`[analyze_pdf_document] Analysis complete`);

      return {
        documentName,
        pdfUrl,
        analysis: analysisText,
        summary: `Successfully analyzed "${documentName}"`,
      };
    } catch (error: any) {
      console.error('[analyze_pdf_document] Error:', error);
      return {
        error: 'Failed to analyze PDF',
        message: error.message || 'Unknown error',
      };
    }
  },

  // === STUDYDECK TOOLS ===
  search_studydeck_resources: async (args, userId) => {
    try {
      const { studydeckService } = await import('../../studydeck/studydeck.service');

      // Get user's StudyDeck token, fallback to environment variable
      let jwtToken = await studydeckService.getUserToken(userId);

      if (!jwtToken) {
        jwtToken = process.env.STUDYDECK_JWT_TOKEN || null;
      }

      if (!jwtToken) {
        return {
          error: 'StudyDeck not configured',
          message:
            'StudyDeck access is not configured. Please set STUDYDECK_JWT_TOKEN in environment variables or connect your StudyDeck account.',
        };
      }

      const courseCode = args.courseCode;
      const resourceType = args.resourceType || 'all';

      console.log(
        `[search_studydeck_resources] Searching for ${resourceType} in ${courseCode}`
      );

      const results = await studydeckService.searchResources(
        courseCode,
        resourceType as any,
        jwtToken,
        20
      );

      if (results.folders.length === 0 && results.documents.length === 0) {
        return {
          courseCode,
          resourceType,
          message: `No ${resourceType} resources found for ${courseCode} on StudyDeck.`,
          folders: [],
          documents: [],
        };
      }

      console.log(
        `[search_studydeck_resources] Found ${results.folders.length} folders, ${results.documents.length} documents`
      );

      return {
        courseCode,
        resourceType,
        folders: results.folders,
        documents: results.documents,
        summary: `Found ${results.folders.length} folders with ${results.documents.length} documents`,
      };
    } catch (error: any) {
      console.error('[search_studydeck_resources] Error:', error);
      return {
        error: 'Failed to search StudyDeck',
        message: error.message || 'Unknown error occurred while searching StudyDeck',
      };
    }
  },

  get_studydeck_folder_documents: async (args, userId) => {
    try {
      const { studydeckService } = await import('../../studydeck/studydeck.service');

      // Get user's StudyDeck token, fallback to environment variable
      let jwtToken = await studydeckService.getUserToken(userId);

      if (!jwtToken) {
        jwtToken = process.env.STUDYDECK_JWT_TOKEN || null;
      }

      if (!jwtToken) {
        return {
          error: 'StudyDeck not configured',
          message: 'StudyDeck access is not configured.',
        };
      }

      const folderStaticId = args.folderStaticId;

      console.log(`[get_studydeck_folder_documents] Fetching documents from folder ${folderStaticId}`);

      const documents = await studydeckService.getFolderDocuments(folderStaticId, jwtToken);

      console.log(`[get_studydeck_folder_documents] Found ${documents.length} documents`);

      return {
        folderStaticId,
        documents,
        count: documents.length,
      };
    } catch (error: any) {
      console.error('[get_studydeck_folder_documents] Error:', error);
      return {
        error: 'Failed to get folder documents',
        message: error.message || 'Unknown error',
      };
    }
  },

  // === SKILLS & INTERESTS ===
  get_all_skills: async (args, _userId) => {
    return await skillsInterestsService.getAllSkills({
      category: args.category,
      difficulty: args.difficulty,
      search: args.search,
    });
  },

  get_user_skills: async (args, userId) => {
    return await skillsInterestsService.getUserSkills(userId, args.status);
  },

  get_user_skill_stats: async (_args, userId) => {
    return await skillsInterestsService.getUserStats(userId);
  },

  get_skill_recommendations: async (_args, userId) => {
    return await skillsInterestsService.getRecommendations(userId);
  },

  get_related_skills: async (args, _userId) => {
    return await skillsInterestsService.getRelatedSkills(args.skillId);
  },

  get_skill_resources: async (args, _userId) => {
    return await skillsInterestsService.getSkillResources(args.skillId);
  },

  add_skill_to_user: async (args, userId) => {
    return await skillsInterestsService.addSkillToUser(
      userId,
      args.skillInterestId,
      args.status || 'interested'
    );
  },

  update_user_skill: async (args, userId) => {
    return await skillsInterestsService.updateUserSkill(userId, args.skillInterestId, {
      status: args.status,
      progress: args.progress,
      notes: args.notes,
    });
  },
  add_interest_with_plan: async (args, userId) => {
    return await skillsInterestsService.addInterestWithPlan(userId, {
      interest: args.interest,
      status: args.status,
      additionalPreferences: args.additionalPreferences,
    });
  },
  get_skill_plan: async (args, userId) => {
    return await skillsInterestsService.getSkillPlan(userId, args.skillInterestId);
  },
  update_skill_task: async (args, userId) => {
    return await skillsInterestsService.updateSkillTask(userId, args.taskId, {
      status: args.status,
      notes: args.notes,
    });
  },
  add_skill_task_to_schedule: async (args, userId) => {
    return await skillsInterestsService.addSkillTaskToSchedule(userId, args.taskId, {
      scheduleId: args.scheduleId,
      startDateTime: args.startDateTime,
      endDateTime: args.endDateTime,
    });
  },

  remove_user_skill: async (args, userId) => {
    await skillsInterestsService.removeSkillFromUser(userId, args.skillInterestId);
    return { message: 'Skill removed from user successfully' };
  },

  create_skill: async (args, _userId) => {
    return await skillsInterestsService.createSkill(args);
  },

  update_skill: async (args, _userId) => {
    const { skillId, ...data } = args;
    return await skillsInterestsService.updateSkill(skillId, data);
  },

  add_skill_relationship: async (args, _userId) => {
    return await skillsInterestsService.addSkillRelationship({
      fromSkillId: args.fromSkillId,
      toSkillId: args.toSkillId,
      relationshipType: args.relationshipType,
      description: args.description,
    });
  },

  delete_skill_relationship: async (args, _userId) => {
    await skillsInterestsService.deleteSkillRelationship(args.fromSkillId, args.toSkillId);
    return { message: 'Relationship deleted successfully' };
  },

  add_skill_resource: async (args, userId) => {
    return await skillsInterestsService.addResource({
      ...args,
      userId,
    });
  },

  update_skill_resource: async (args, _userId) => {
    const { resourceId, ...data } = args;
    return await skillsInterestsService.updateResource(resourceId, data);
  },

  delete_skill_resource: async (args, _userId) => {
    await skillsInterestsService.deleteResource(args.resourceId);
    return { message: 'Resource deleted successfully' };
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
    // Generous timeouts: PDF analysis (120s), normal tools (30s)
    const longRunningTools = ['analyze_course_handout', 'analyze_pdf_document'];
    const timeout = longRunningTools.includes(name) ? 120000 : 30000;

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

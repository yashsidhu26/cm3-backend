/**
 * Tool Registry and Dispatcher
 * Maps tool names to their handler functions
 */

import { academicsService } from '../../../modules/academics/academics.service';
import { sectionsService } from '../../../modules/academics/sections.service';
import { studentProfileService } from '../../../modules/student-profile/student-profile.service';
import { skillsInterestsService } from '../../../modules/skills-interests/skills-interests.service';
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

  get_course_resources: async (args, userId) => {
    // Get resources from DB
    const resources = await academicsService.getCourseResources(args.courseId);

    // Get user's Moodle token to append to URLs
    try {
      const { getMoodleToken } = await import('../../academics/moodle-auth.service');
      const moodleToken = await getMoodleToken(userId);

      if (moodleToken) {
        // Append token to file URLs that don't already have it
        return resources.map((resource) => {
          if (resource.fileUrl && !resource.fileUrl.includes('token=')) {
            const separator = resource.fileUrl.includes('?') ? '&' : '?';
            return {
              ...resource,
              fileUrl: `${resource.fileUrl}${separator}token=${moodleToken}`,
            };
          }
          return resource;
        });
      }
    } catch (error) {
      console.warn('[get_course_resources] Could not get Moodle token:', error);
    }

    // Return resources as-is if token unavailable
    return resources;
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

      // Use gemini-2.5-flash-lite for PDF analysis (better multimodal capabilities)
      const model = vertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
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

      // Use gemini-2.5-flash-lite for PDF analysis
      const model = vertexAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
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

      // Get user's StudyDeck token
      const jwtToken = await studydeckService.getUserToken(userId);

      if (!jwtToken) {
        return {
          error: 'StudyDeck not connected',
          message:
            'You need to connect your StudyDeck account first to access lecture slides and study materials.',
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

      // Get user's StudyDeck token
      const jwtToken = await studydeckService.getUserToken(userId);

      if (!jwtToken) {
        return {
          error: 'StudyDeck not connected',
          message: 'You need to connect your StudyDeck account first.',
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
    // Generous timeouts: PDF analysis (60s), normal tools (30s)
    const timeout = name === 'analyze_course_handout' ? 60000 : 30000;

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

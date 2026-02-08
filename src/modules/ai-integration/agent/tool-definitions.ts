/**
 * Tool Definitions for Gemini Function Calling
 * Uses Google AI SDK's SchemaType enum
 */

import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';

export const toolDefinitions: FunctionDeclaration[] = [
  // === ACADEMICS DOMAIN ===
  {
    name: 'get_enrolled_courses',
    description:
      "Get all courses the student is enrolled in, with resource counts and enrollment info. Use when they ask 'what courses am I taking' or 'my courses'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_courses_full_details',
    description:
      'Get courses with FULL details including sections, schedules, handouts, room numbers, instructors, and registration status. Use when the user asks about class timings, sections, or where a class is held.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_course_resources',
    description:
      'Get all resources (PDFs, slides, assignments, videos) for a specific course. Use when the student asks about materials, handouts, or downloads for a course.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        courseId: {
          type: SchemaType.STRING,
          description: 'The internal UUID of the course',
        },
      },
      required: ['courseId'],
    },
  },
  {
    name: 'get_course_by_code',
    description:
      "Look up a course by its course code (e.g., 'CS F111', 'BIO F101'). Use when the student mentions a course by code.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        code: {
          type: SchemaType.STRING,
          description: 'The course code (e.g., CS F111)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'search_all_courses',
    description:
      'Get the full course catalog (limited to first 50). Use only when the user is exploring courses they are NOT enrolled in or wants to browse available courses.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_course_handout',
    description:
      'Download and analyze a course handout PDF using AI vision. Use when the student asks "what is in [course] handout", "tell me about [course] syllabus", or wants to know handout contents. This downloads the PDF and uses Gemini to analyze it.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        courseCode: {
          type: SchemaType.STRING,
          description: 'The course code (e.g., CS F111, MATH F112)',
        },
      },
      required: ['courseCode'],
    },
  },

  // === SCHEDULE DOMAIN ===
  {
    name: 'get_class_schedule',
    description:
      "Get the student's complete class timetable (lectures, tutorials, labs) with days, times, rooms, and instructors. Use when asking about free time, schedule conflicts, or 'what class do I have on [day]'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_course_sections',
    description:
      'Get all available sections (and their schedules) for a specific course. Use when the student asks about section options or wants to compare timings.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        courseId: {
          type: SchemaType.STRING,
          description: 'The internal UUID of the course',
        },
      },
      required: ['courseId'],
    },
  },

  // === STUDENT PROFILE DOMAIN ===
  {
    name: 'get_dashboard',
    description:
      "Get the student's profile, academic info (GPA, major, skills, interests), behavioral insights (completion rate, peak productivity), and gap analysis (skill gaps, recommendations). Use for personalized advice or when they ask 'tell me about myself'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_study_plan',
    description:
      "Get a personalized study plan based on the student's productivity patterns. Use when they ask for study planning or time management advice.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_behavior_analysis',
    description:
      "Analyze the student's productivity patterns: completion rate, peak productivity window, total tasks logged. Use for productivity insights.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },

  // === ACTIVITY & EXPERIENCE DOMAIN ===
  {
    name: 'get_activity_logs',
    description:
      "Get the student's recent activity logs (task completions, scheduled vs actual times). Use for understanding work patterns.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: {
          type: SchemaType.NUMBER,
          description: 'Maximum number of logs to return (default 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_experiences',
    description:
      "Get the student's experiences (internships, projects, extracurriculars). Use when discussing resume, career advice, or gap analysis.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_commitments',
    description:
      "Get the student's commitments (academic deadlines, extracurricular obligations, personal events). Use for scheduling and workload assessment.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },

  // === SOCIAL DOMAIN ===
  {
    name: 'get_user_tasks',
    description:
      "Get tasks assigned to the student across all groups. Use when they ask about pending work, deadlines, or what they need to do.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },

  // === MOODLE DOMAIN ===
  {
    name: 'get_moodle_notifications',
    description:
      'Get recent Moodle LMS notifications (assignment deadlines, grade postings, forum posts). Use when the student asks about Moodle updates or notifications.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
];

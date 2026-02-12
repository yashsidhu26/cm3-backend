/**
 * Tool Definitions for Gemini Function Calling via Vertex AI
 * Uses Vertex AI SDK's SchemaType enum
 */

import { SchemaType, type FunctionDeclaration } from '@google-cloud/vertexai';

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
  {
    name: 'analyze_pdf_document',
    description:
      'IMMEDIATELY download and analyze ANY PDF document using AI vision when you find it in Moodle or StudyDeck resources. Use this AUTOMATICALLY (without asking user) when: (1) user asks "what was covered" and you found a lecture/module PDF, (2) user asks to "open" or "show" a PDF, (3) you need to know the content of any PDF file. The pdfUrl comes from the fileUrl field in get_course_resources or search_studydeck_resources response.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        pdfUrl: {
          type: SchemaType.STRING,
          description: 'The direct URL to the PDF file (fileUrl from Moodle get_course_resources or StudyDeck search)',
        },
        documentName: {
          type: SchemaType.STRING,
          description: 'The name/title of the document for context (use the resource name, e.g., "Module 1 - Introduction")',
        },
      },
      required: ['pdfUrl', 'documentName'],
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

  // === STUDYDECK DOMAIN (Lecture Slides, PYQs, Notes) ===
  {
    name: 'search_studydeck_resources',
    description:
      'Search for lecture slides, past papers (PYQs), notes, and other study resources from StudyDeck by course code. Use when student asks for slides, papers, notes, or study materials for a specific course. Returns both folders and direct download links.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        courseCode: {
          type: SchemaType.STRING,
          description: 'The course code (e.g., CS F111, BIO F111, MATH F112)',
        },
        resourceType: {
          type: SchemaType.STRING,
          description:
            'Type of resource to search for: "slides" (lecture slides), "papers" (past papers/PYQs), "notes" (study notes), or "all" (all types). Default is "all".',
        },
      },
      required: ['courseCode'],
    },
  },
  {
    name: 'get_studydeck_folder_documents',
    description:
      'Get all documents (PDFs, slides, papers) from a specific StudyDeck folder. Use when you have a folder ID and need to see what documents are inside it. Returns direct download links for each document.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        folderStaticId: {
          type: SchemaType.STRING,
          description: 'The StudyDeck folder ID (UUID format)',
        },
      },
      required: ['folderStaticId'],
    },
  },

  // === SKILLS & INTERESTS DOMAIN ===
  {
    name: 'get_all_skills',
    description:
      'Get all available skills from the catalog. Optionally filter by category (programming, design, business, languages, personal, academic, creative, technical, other), difficulty (beginner, intermediate, advanced, expert), or search term.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        category: {
          type: SchemaType.STRING,
          description: 'Filter by skill category',
        },
        difficulty: {
          type: SchemaType.STRING,
          description: 'Filter by difficulty level',
        },
        search: {
          type: SchemaType.STRING,
          description: 'Search term to filter skills by name, description, or tags',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_user_skills',
    description:
      "Get the user's skills/interests they are learning or interested in, with progress tracking. Optionally filter by status (interested, learning, completed, paused).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: {
          type: SchemaType.STRING,
          description: 'Filter by learning status',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_user_skill_stats',
    description:
      "Get user's learning statistics: total skills, skills by status (interested, learning, completed, paused), total progress, and average progress.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_skill_recommendations',
    description:
      "Get personalized skill recommendations for the user based on their current skills (completed or learning). Uses skill relationships to suggest what to learn next.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_related_skills',
    description:
      'Get skills related to a specific skill (prerequisites, related topics, builds-on relationships, alternatives). Use to help users discover learning paths.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillId: {
          type: SchemaType.STRING,
          description: 'The skill UUID',
        },
      },
      required: ['skillId'],
    },
  },
  {
    name: 'get_skill_resources',
    description:
      'Get all learning resources (courses, tutorials, books, videos, etc.) for a specific skill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillId: {
          type: SchemaType.STRING,
          description: 'The skill UUID',
        },
      },
      required: ['skillId'],
    },
  },
  {
    name: 'add_skill_to_user',
    description:
      "Add a skill to the user's learning list. Use when user expresses interest in learning something or wants to track a skill.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillInterestId: {
          type: SchemaType.STRING,
          description: 'The skill UUID from the catalog',
        },
        status: {
          type: SchemaType.STRING,
          description: 'Initial status: interested, learning, completed, paused (default: interested)',
        },
      },
      required: ['skillInterestId'],
    },
  },
  {
    name: 'update_user_skill',
    description:
      "Update user's progress on a skill. Use to change status (e.g., from interested to learning), update progress (0-100), or add notes.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillInterestId: {
          type: SchemaType.STRING,
          description: 'The skill UUID',
        },
        status: {
          type: SchemaType.STRING,
          description: 'New status: interested, learning, completed, paused',
        },
        progress: {
          type: SchemaType.INTEGER,
          description: 'Progress percentage (0-100)',
        },
        notes: {
          type: SchemaType.STRING,
          description: 'Personal notes about learning progress',
        },
      },
      required: ['skillInterestId'],
    },
  },
  {
    name: 'remove_user_skill',
    description:
      "Remove a skill from the user's learning list. Use when user no longer wants to track a skill.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillInterestId: {
          type: SchemaType.STRING,
          description: 'The skill UUID to remove',
        },
      },
      required: ['skillInterestId'],
    },
  },
  {
    name: 'create_skill',
    description:
      'Create a new skill in the catalog. Use when user mentions a skill that doesn\'t exist yet and they want to track it.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: 'Skill name',
        },
        category: {
          type: SchemaType.STRING,
          description: 'Category: programming, design, business, languages, personal, academic, creative, technical, other',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Skill description',
        },
        difficulty: {
          type: SchemaType.STRING,
          description: 'Difficulty: beginner, intermediate, advanced, expert',
        },
        estimatedHours: {
          type: SchemaType.INTEGER,
          description: 'Estimated hours to learn',
        },
        tags: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.STRING,
          },
          description: 'Tags for search and categorization',
        },
        icon: {
          type: SchemaType.STRING,
          description: 'Icon emoji or name',
        },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'update_skill',
    description:
      'Update a skill in the catalog (name, description, difficulty, tags, etc.). Use to fix or enhance skill information.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillId: {
          type: SchemaType.STRING,
          description: 'The skill UUID to update',
        },
        name: {
          type: SchemaType.STRING,
          description: 'New skill name',
        },
        category: {
          type: SchemaType.STRING,
          description: 'New category',
        },
        description: {
          type: SchemaType.STRING,
          description: 'New description',
        },
        difficulty: {
          type: SchemaType.STRING,
          description: 'New difficulty level',
        },
        estimatedHours: {
          type: SchemaType.INTEGER,
          description: 'New estimated hours',
        },
        tags: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.STRING,
          },
          description: 'New tags',
        },
        icon: {
          type: SchemaType.STRING,
          description: 'New icon',
        },
      },
      required: ['skillId'],
    },
  },
  {
    name: 'add_skill_relationship',
    description:
      'Create a relationship between two skills (e.g., "Python is a prerequisite for Machine Learning", "React is related to Next.js"). Use to build learning paths and suggest skill progressions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fromSkillId: {
          type: SchemaType.STRING,
          description: 'The source skill UUID',
        },
        toSkillId: {
          type: SchemaType.STRING,
          description: 'The target skill UUID',
        },
        relationshipType: {
          type: SchemaType.STRING,
          description: 'Type: prerequisite, related, builds_on, alternative',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Optional description of why they are related',
        },
      },
      required: ['fromSkillId', 'toSkillId', 'relationshipType'],
    },
  },
  {
    name: 'delete_skill_relationship',
    description:
      'Delete a relationship between two skills.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fromSkillId: {
          type: SchemaType.STRING,
          description: 'The source skill UUID',
        },
        toSkillId: {
          type: SchemaType.STRING,
          description: 'The target skill UUID',
        },
      },
      required: ['fromSkillId', 'toSkillId'],
    },
  },
  {
    name: 'add_skill_resource',
    description:
      'Add a learning resource (course, tutorial, book, video, etc.) to a skill. Use when user finds a helpful resource or wants to save a learning link.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        skillInterestId: {
          type: SchemaType.STRING,
          description: 'The skill UUID',
        },
        title: {
          type: SchemaType.STRING,
          description: 'Resource title',
        },
        url: {
          type: SchemaType.STRING,
          description: 'Resource URL',
        },
        type: {
          type: SchemaType.STRING,
          description: 'Type: article, video, course, book, tutorial, documentation, project, other',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Resource description',
        },
        difficulty: {
          type: SchemaType.STRING,
          description: 'Difficulty: beginner, intermediate, advanced, expert',
        },
        estimatedHours: {
          type: SchemaType.INTEGER,
          description: 'Estimated hours to complete',
        },
      },
      required: ['skillInterestId', 'title', 'type'],
    },
  },
  {
    name: 'update_skill_resource',
    description:
      'Update a learning resource for a skill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        resourceId: {
          type: SchemaType.STRING,
          description: 'The resource UUID',
        },
        title: {
          type: SchemaType.STRING,
          description: 'New title',
        },
        url: {
          type: SchemaType.STRING,
          description: 'New URL',
        },
        type: {
          type: SchemaType.STRING,
          description: 'New type',
        },
        description: {
          type: SchemaType.STRING,
          description: 'New description',
        },
        difficulty: {
          type: SchemaType.STRING,
          description: 'New difficulty',
        },
        estimatedHours: {
          type: SchemaType.INTEGER,
          description: 'New estimated hours',
        },
      },
      required: ['resourceId'],
    },
  },
  {
    name: 'delete_skill_resource',
    description:
      'Delete a learning resource from a skill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        resourceId: {
          type: SchemaType.STRING,
          description: 'The resource UUID to delete',
        },
      },
      required: ['resourceId'],
    },
  },
];

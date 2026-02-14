/**
 * Tool Access Messages for Streaming
 * Maps tool names to user-friendly status messages
 */

export const TOOL_MESSAGES: Record<string, string> = {
  // Course & Enrollment Tools
  get_enrolled_courses: "📚 Accessing your enrolled courses...",
  get_courses_full_details: "📖 Fetching detailed course information...",
  get_course_full_details: "📦 Fetching course details with recent resources...",
  get_course_by_code: "🔍 Looking up course details...",
  search_all_courses: "🔎 Searching available courses...",
  get_course_resources: "📄 Retrieving course materials...",
  get_course_sections: "📋 Checking available sections...",

  // Schedule Tools
  get_class_schedule: "📅 Checking your class schedule...",
  get_schedule_items: "🗓️ Loading schedule items...",
  get_user_schedules: "🗂️ Loading your schedules...",
  get_schedule_details: "🧩 Loading schedule details...",
  optimize_day_schedule: "🛠️ Optimizing your day...",
  edit_smart_schedule: "✍️ Updating your schedule...",

  // Moodle Tools
  get_moodle_notifications: "🔔 Checking Moodle notifications...",
  sync_moodle_data: "🔄 Syncing data from Moodle...",

  // StudyDeck Tools
  search_studydeck_resources: "📚 Searching StudyDeck for resources...",
  get_studydeck_folder_documents: "📁 Accessing StudyDeck documents...",

  // PDF Analysis
  analyze_course_handout: "📄 Analyzing course handout...",
  analyze_pdf_document: "📑 Reading and analyzing PDF document...",

  // Tasks & Assignments
  get_user_tasks: "✅ Fetching your tasks...",
  get_conversation_history: "🕘 Loading recent conversation context...",
  get_assignments: "📝 Checking assignments...",
  get_upcoming_evaluations: "📊 Looking up upcoming evaluations...",

  // Course Progress
  get_user_course_progress: "📈 Checking course progress...",
  update_course_progress: "✏️ Updating course progress...",

  // Dashboard & Analytics
  get_dashboard: "📊 Loading your dashboard data...",
  get_study_plan: "📘 Retrieving your study plan...",
  get_behavior_analysis: "📈 Analyzing your study patterns...",
  get_activity_logs: "📜 Checking activity history...",

  // Skills & Interests
  get_all_skills: "🎯 Loading skills catalog...",
  get_user_skills: "💡 Fetching your skills...",
  get_user_skill_stats: "📊 Analyzing skill progress...",
  get_skill_recommendations: "✨ Getting skill recommendations...",
  get_related_skills: "🔗 Finding related skills...",
  get_skill_resources: "📚 Loading learning resources...",
  add_skill_to_user: "➕ Adding skill to your profile...",
  update_user_skill: "✏️ Updating skill progress...",
  add_interest_with_plan: "🧠 Building a learning plan...",
  get_skill_plan: "🗺️ Loading your learning plan...",
  update_skill_task: "✅ Updating task progress...",
  add_skill_task_to_schedule: "📌 Adding task to schedule...",
  remove_user_skill: "➖ Removing skill...",
  create_skill: "🆕 Creating new skill...",
  update_skill: "✏️ Updating skill...",
  add_skill_relationship: "🔗 Linking skills...",
  delete_skill_relationship: "🔓 Unlinking skills...",
  add_skill_resource: "📚 Adding learning resource...",
  update_skill_resource: "✏️ Updating resource...",
  delete_skill_resource: "🗑️ Removing resource...",

  // Experience & Commitments
  get_experiences: "💼 Loading your experiences...",
  get_commitments: "📌 Checking your commitments...",

  // Profile
  get_user_profile: "👤 Loading your profile...",
  update_user_profile: "✏️ Updating profile...",
};

/**
 * Get user-friendly message for a tool
 */
export function getToolMessage(toolName: string): string {
  return TOOL_MESSAGES[toolName] || `🔧 Using ${toolName}...`;
}

/**
 * Get simplified message without emoji (for accessibility)
 */
export function getToolMessageSimple(toolName: string): string {
  const message = getToolMessage(toolName);
  return message.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
}

/**
 * Check if tool requires user notification
 * Some tools are too fast/frequent to notify about
 */
export function shouldNotifyToolUse(toolName: string): boolean {
  // Don't notify for very fast internal tools
  const silentTools = [
    'get_current_time',
    'get_current_date',
  ];

  return !silentTools.includes(toolName);
}

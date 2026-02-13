-- Performance Optimization Indexes
-- Run with: psql $DATABASE_URL -f scripts/add-performance-indexes.sql

-- Speed up enrollment queries
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);

-- Speed up assignment queries
CREATE INDEX IF NOT EXISTS idx_student_assignments_user_id ON student_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_student_assignments_due_date ON student_assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_student_assignments_user_date ON student_assignments(user_id, due_date);

-- Speed up schedule queries
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule_id ON schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_start_time ON schedule_items(start_date_time);
CREATE INDEX IF NOT EXISTS idx_user_section_registrations_user_id ON user_section_registrations(user_id);

-- Speed up course queries
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
CREATE INDEX IF NOT EXISTS idx_course_sections_course_id ON course_sections(course_id);

-- Speed up AI conversation queries
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_created ON ai_conversations(user_id, created_at DESC);

-- Speed up activity log queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Speed up skill tracking
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);

-- Speed up experience queries
CREATE INDEX IF NOT EXISTS idx_experiences_user_id ON experiences(user_id);

-- Speed up commitment queries
CREATE INDEX IF NOT EXISTS idx_commitments_user_id ON commitments(user_id);

-- Analyze tables to update statistics
ANALYZE enrollments;
ANALYZE student_assignments;
ANALYZE schedule_items;
ANALYZE courses;
ANALYZE ai_conversations;
ANALYZE activity_logs;
ANALYZE user_skills;
ANALYZE experiences;
ANALYZE commitments;

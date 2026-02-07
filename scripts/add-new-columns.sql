-- Add new columns to courses table
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS static_id VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS units INTEGER,
  ADD COLUMN IF NOT EXISTS course_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(255),
  ADD COLUMN IF NOT EXISTS handout_link TEXT;

-- Create course_sections table
CREATE TABLE IF NOT EXISTS course_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_type VARCHAR(50) NOT NULL,
  section_number INTEGER NOT NULL,
  instructors TEXT[],
  room_number VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create class_schedule table
CREATE TABLE IF NOT EXISTS class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create user_section_registrations table
CREATE TABLE IF NOT EXISTS user_section_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  registered_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create studydeck_token table
CREATE TABLE IF NOT EXISTS studydeck_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_static_id ON courses(static_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_course_id ON course_sections(course_id);
CREATE INDEX IF NOT EXISTS idx_class_schedule_section_id ON class_schedule(section_id);
CREATE INDEX IF NOT EXISTS idx_user_section_registrations_user_id ON user_section_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_section_registrations_section_id ON user_section_registrations(section_id);
CREATE INDEX IF NOT EXISTS idx_studydeck_token_user_id ON studydeck_token(user_id);

COMMENT ON TABLE courses IS 'Stores course information from Moodle, BITS catalog, and handouts';
COMMENT ON TABLE course_sections IS 'Stores section details (lecture, tutorial, lab) from StudyDeck';
COMMENT ON TABLE class_schedule IS 'Stores individual class timings for each section';
COMMENT ON TABLE user_section_registrations IS 'Tracks which sections each user is registered for';
COMMENT ON TABLE studydeck_token IS 'Stores encrypted StudyDeck JWT tokens (optional per-user storage)';

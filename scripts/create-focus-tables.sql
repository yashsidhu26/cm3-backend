-- Create tables for Focus Screen (Assignments & Evaluations)
-- Run this if drizzle migrations fail

-- Create enums (skip if already exist)
DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('not_started', 'in_progress', 'submitted', 'graded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE evaluation_type AS ENUM ('quiz', 'exam', 'report', 'presentation', 'project');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create student_assignments table
CREATE TABLE IF NOT EXISTS student_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    course_id UUID,
    course_code VARCHAR(50),
    course_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMP NOT NULL,
    priority task_priority DEFAULT 'medium',
    status assignment_status DEFAULT 'not_started',
    moodle_assignment_id VARCHAR(100),
    notification_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create student_evaluations table
CREATE TABLE IF NOT EXISTS student_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    course_id UUID,
    course_code VARCHAR(50),
    course_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    type evaluation_type NOT NULL,
    date TIMESTAMP NOT NULL,
    duration VARCHAR(50),
    location VARCHAR(255),
    description TEXT,
    moodle_event_id VARCHAR(100),
    notification_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON student_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON student_assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON student_assignments(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_user_id ON student_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_date ON student_evaluations(date);
CREATE INDEX IF NOT EXISTS idx_evaluations_type ON student_evaluations(type);

-- Insert sample data for testing (optional)
-- Uncomment to insert test data for your user

/*
-- Replace 'YOUR_USER_ID' with actual user UUID
INSERT INTO student_assignments (user_id, course_code, course_name, title, description, due_date, priority, status) VALUES
('YOUR_USER_ID', 'PHY F111', 'Physics', 'Wave Optics Assignment', 'Complete problems 1-10', NOW() + INTERVAL '1 day', 'high', 'not_started'),
('YOUR_USER_ID', 'CS F111', 'Data Structures', 'Lab 8: Binary Trees', 'Implement BST insert, delete, search', NOW() + INTERVAL '2 days', 'medium', 'not_started'),
('YOUR_USER_ID', 'MATH F112', 'Linear Algebra', 'Problem Set 4', 'Exercises 1-20', NOW() + INTERVAL '7 days', 'low', 'not_started');

INSERT INTO student_evaluations (user_id, course_code, course_name, title, type, date, duration, location, description) VALUES
('YOUR_USER_ID', 'CS F111', 'Data Structures', 'Quiz 3: Trees & Graphs', 'quiz', NOW() + INTERVAL '1 day', '60 minutes', 'Room 2205', 'Binary trees, BST, graph traversal'),
('YOUR_USER_ID', 'MATH F112', 'Linear Algebra', 'Mid-Semester Exam', 'exam', NOW() + INTERVAL '10 days', '120 minutes', 'Exam Hall 1', 'Chapters 1-5'),
('YOUR_USER_ID', 'CS F214', 'Logic in CS', 'Mid-Semester Report', 'report', NOW() + INTERVAL '8 days', NULL, NULL, 'Project report submission');
*/

-- Verify tables created
SELECT 'student_assignments' AS table_name, COUNT(*) AS row_count FROM student_assignments
UNION ALL
SELECT 'student_evaluations', COUNT(*) FROM student_evaluations;

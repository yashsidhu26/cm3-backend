-- Clear test assignments and evaluations
-- Run this to remove test data created during API testing

-- Show current counts
SELECT 'Before deletion:' as status;
SELECT 'Assignments:' as type, COUNT(*) as count FROM student_assignments
UNION ALL
SELECT 'Evaluations:', COUNT(*) FROM student_evaluations;

-- Delete test data (only for your user - replace with your actual user_id if needed)
-- Or delete all test data:
DELETE FROM student_assignments WHERE description LIKE '%test%' OR description LIKE '%Test%';
DELETE FROM student_evaluations WHERE description LIKE '%test%' OR description LIKE '%Test%';

-- Or delete ALL assignments and evaluations to start fresh:
-- DELETE FROM student_assignments;
-- DELETE FROM student_evaluations;

-- Show after counts
SELECT 'After deletion:' as status;
SELECT 'Assignments:' as type, COUNT(*) as count FROM student_assignments
UNION ALL
SELECT 'Evaluations:', COUNT(*) FROM student_evaluations;

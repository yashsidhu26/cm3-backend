/**
 * Test Course Matching
 * Validates the fuzzy matching logic for course codes
 *
 * Usage: bun run scripts/test-course-matching.ts
 */

import {
  normalizeCourseCode,
  matchCourseCodes,
  extractCourseCodeFromMoodle,
  findMatchingCourse,
  findBestMatch,
} from '../src/modules/academics/course-matcher';

console.log('🧪 Testing Course Matching Logic\n');
console.log('='.repeat(60) + '\n');

// Test 1: Normalize course codes
console.log('Test 1: Normalize Course Codes');
console.log('-'.repeat(60));

const testCodes = [
  'BIO F101',
  'BIOF101',
  'BIO_F101',
  'BIO-F101',
  'bio f101',
  'CS F111',
  'CSF111',
];

testCodes.forEach(code => {
  console.log(`  "${code}" → "${normalizeCourseCode(code)}"`);
});
console.log('');

// Test 2: Match course codes
console.log('Test 2: Match Course Codes');
console.log('-'.repeat(60));

const matchTests = [
  ['BIO F101', 'BIOF101'],
  ['CS F111', 'CSF111'],
  ['MATH F112', 'MATH-F112'],
  ['BIO F101', 'CS F111'],
  ['ECON F211', 'ECOF211'],
];

matchTests.forEach(([code1, code2]) => {
  const match = matchCourseCodes(code1, code2);
  console.log(`  "${code1}" vs "${code2}": ${match ? '✓ MATCH' : '✗ NO MATCH'}`);
});
console.log('');

// Test 3: Extract course code from Moodle text
console.log('Test 3: Extract Course Code from Moodle');
console.log('-'.repeat(60));

const moodleTexts = [
  'BIO F101 - Introduction to Biology',
  'CS F111 Computer Programming',
  'MATH-F112',
  'ECON_F211',
  'Introduction to Economics (ECON F211)',
  'PHY F111L Physics Lab',
  'Random text without course code',
];

moodleTexts.forEach(text => {
  const extracted = extractCourseCodeFromMoodle(text);
  console.log(`  "${text}"`);
  console.log(`    → ${extracted ? `"${extracted}"` : 'NO MATCH'}`);
});
console.log('');

// Test 4: Find matching course
console.log('Test 4: Find Matching Course');
console.log('-'.repeat(60));

const courseList = [
  { course_id: 'BIO F101', name: 'Intro To Bio Sci' },
  { course_id: 'CS F111', name: 'Computer Programming' },
  { course_id: 'MATH F112', name: 'Mathematics II' },
  { course_id: 'ECON F211', name: 'Principles of Economics' },
];

const searchCodes = ['BIOF101', 'CSF111', 'MATH-F112', 'PHY F111'];

searchCodes.forEach(searchCode => {
  const match = findMatchingCourse(searchCode, courseList);
  console.log(`  Search: "${searchCode}"`);
  console.log(`    → ${match ? `Found: ${match.course_id} - ${match.name}` : 'NOT FOUND'}`);
});
console.log('');

// Test 5: Best match with fuzzy matching
console.log('Test 5: Best Match (Fuzzy Matching)');
console.log('-'.repeat(60));

const fuzzySearches = [
  'BIO F10',  // Missing last digit
  'CS F11',   // Missing last digit
  'BIOF',     // Incomplete
  'Introduction to Biology',  // By name
  'Computer Prog',  // Partial name
];

fuzzySearches.forEach(search => {
  const match = findBestMatch(search, courseList, 0.6);
  console.log(`  Search: "${search}"`);
  if (match) {
    console.log(`    → Found: ${match.course.course_id} - ${match.course.name} (score: ${match.score.toFixed(2)})`);
  } else {
    console.log(`    → NOT FOUND (below threshold)`);
  }
});
console.log('');

console.log('='.repeat(60));
console.log('✅ All tests completed!\n');

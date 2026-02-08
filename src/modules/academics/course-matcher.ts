/**
 * Course Matcher Utility
 * Handles fuzzy matching between different course code formats
 *
 * Examples of formats to match:
 * - "BIO F101" (BITS format)
 * - "BIOF101" (Moodle format)
 * - "BIO_F101" (Alternative format)
 * - "BIO-F101" (Alternative format)
 */

/**
 * Normalize a course code by removing spaces, underscores, hyphens
 * and converting to uppercase
 *
 * @param code - Course code in any format
 * @returns Normalized code (e.g., "BIOF101")
 */
export function normalizeCourseCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s_\-]/g, '') // Remove spaces, underscores, hyphens
    .trim();
}

/**
 * Extract the subject and number from a course code
 *
 * @param code - Course code (e.g., "BIO F101")
 * @returns Object with subject and number
 */
export function parseCourseCode(code: string): { subject: string; number: string } | null {
  const normalized = normalizeCourseCode(code);

  // Match pattern: letters followed by letters+numbers
  // Examples: BIOF101, CSF111, MATHF112, ECOF211
  const match = normalized.match(/^([A-Z]+?)([A-Z]?\d+[A-Z]?)$/);

  if (!match) return null;

  // Handle cases like "ECOF211" where we want "ECON" + "F211"
  // by trying to extract the letter before the digits
  let subject = match[1];
  let number = match[2];

  // If number starts with a letter, try to move it to subject
  if (number.match(/^[A-Z]\d/)) {
    const letterInNumber = number[0];
    // Check if subject ends with common prefixes (ECO, BIO, CHE, etc.)
    // and the letter could be part of the subject
    if (subject.length >= 2) {
      subject = subject + letterInNumber;
      number = number.substring(1);
    }
  }

  return {
    subject,
    number,
  };
}

/**
 * Check if two course codes match
 * Handles different formats and fuzzy matching
 *
 * @param code1 - First course code
 * @param code2 - Second course code
 * @returns true if codes match
 */
export function matchCourseCodes(code1: string, code2: string): boolean {
  // Exact match after normalization
  const normalized1 = normalizeCourseCode(code1);
  const normalized2 = normalizeCourseCode(code2);

  if (normalized1 === normalized2) return true;

  // Parse and compare components
  const parsed1 = parseCourseCode(code1);
  const parsed2 = parseCourseCode(code2);

  if (!parsed1 || !parsed2) return false;

  // Check if subject and number match
  return parsed1.subject === parsed2.subject && parsed1.number === parsed2.number;
}

/**
 * Find a matching course code in a list
 *
 * @param searchCode - Course code to search for
 * @param courseList - List of course objects with a code property
 * @returns Matching course or null
 */
export function findMatchingCourse<T extends { course_id?: string; code?: string; course_code?: string }>(
  searchCode: string,
  courseList: T[]
): T | null {
  for (const course of courseList) {
    const courseCode = course.course_id || course.code || course.course_code;
    if (courseCode && matchCourseCodes(searchCode, courseCode)) {
      return course;
    }
  }
  return null;
}

/**
 * Extract course code from Moodle course name or shortname
 * Moodle courses often have formats like:
 * - "BIOF101 - Introduction to Biology"
 * - "CS F111 Computer Programming"
 * - "MATH-F112"
 * - "11641001008_CS F111_JAN_2026" (BITS Moodle format)
 *
 * @param text - Moodle course name or shortname
 * @returns Extracted course code or null
 */
export function extractCourseCodeFromMoodle(text: string): string | null {
  if (!text) return null;

  // Try to find course code pattern in the text
  // Pattern: 2-5 letters followed by optional space/dash/underscore, then letter+numbers
  const patterns = [
    // BITS Moodle format: "11641001008_CS F111_JAN_2026"
    /_([A-Z]{2,5})[\s_\-]([A-Z]?\d{3,4}[A-Z]?)_/i,
    // Standard format: "BIO F101", "BIOF101", "CS-F111"
    /\b([A-Z]{2,5})[\s_\-]?([A-Z]?\d{3,4}[A-Z]?)\b/i,
    // Starting pattern
    /^([A-Z]{2,5})[\s_\-]?([A-Z]?\d{3,4}[A-Z]?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return `${match[1]} ${match[2]}`.toUpperCase();
    }
  }

  return null;
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score (0-1, where 1 is identical)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return 1 - matrix[len1][len2] / maxLen;
}

/**
 * Find best matching course using fuzzy matching
 *
 * @param searchText - Text to search (course code or name)
 * @param courseList - List of courses
 * @param threshold - Minimum similarity threshold (0-1)
 * @returns Best matching course or null
 */
export function findBestMatch<T extends { course_id?: string; code?: string; course_code?: string; name?: string; course_name?: string }>(
  searchText: string,
  courseList: T[],
  threshold: number = 0.7
): { course: T; score: number } | null {
  let bestMatch: { course: T; score: number } | null = null;

  for (const course of courseList) {
    const courseCode = course.course_id || course.code || course.course_code;
    const courseName = course.name || course.course_name;

    // Try exact code match first
    if (courseCode && matchCourseCodes(searchText, courseCode)) {
      return { course, score: 1.0 };
    }

    // Try fuzzy matching on code
    if (courseCode) {
      const codeScore = stringSimilarity(
        normalizeCourseCode(searchText),
        normalizeCourseCode(courseCode)
      );

      if (codeScore >= threshold && (!bestMatch || codeScore > bestMatch.score)) {
        bestMatch = { course, score: codeScore };
      }
    }

    // Try fuzzy matching on name
    if (courseName) {
      const nameScore = stringSimilarity(searchText, courseName);

      if (nameScore >= threshold && (!bestMatch || nameScore > bestMatch.score)) {
        bestMatch = { course, score: nameScore };
      }
    }
  }

  return bestMatch;
}

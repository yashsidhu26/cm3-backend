/**
 * Query Complexity Classifier
 * Routes queries to appropriate model based on actual complexity
 */

export type QueryComplexity = 'simple' | 'medium' | 'complex';

export interface ClassificationResult {
  complexity: QueryComplexity;
  confidence: number;
  reasons: string[];
  recommendedModel: string;
}

// Pattern-based classification
const SIMPLE_PATTERNS = [
  /^what.*my.*schedule/i,
  /^when.*my.*class/i,
  /^do.*i.*have/i,
  /^show.*me/i,
  /^list.*my/i,
  /^what.*time/i,
  /^am.*i.*free/i,
  /^what.*is.*\d+\s*\+\s*\d+/i, // Simple math
  /^(hi|hello|hey|thanks)/i, // Greetings
];

const COMPLEX_PATTERNS = [
  /analyze.*pdf/i,
  /what.*was.*covered/i,
  /compare.*courses/i,
  /recommend/i,
  /create.*plan/i,
  /schedule.*optimization/i,
  /conflict.*resolution/i,
  /prioritize/i,
  /study.*plan/i,
];

const MEDIUM_PATTERNS = [
  /what.*courses/i,
  /tell.*me.*about/i,
  /how.*many/i,
  /which.*course/i,
];

// Tool indicators
const MULTI_TOOL_INDICATORS = [
  /and also/i,
  /also/i,
  /plus/i,
  /additionally/i,
  /furthermore/i,
];

const PDF_INDICATORS = [
  /handout/i,
  /syllabus/i,
  /lecture\s*\d+/i,
  /slide/i,
  /material/i,
  /chapter\s*\d+/i,
  /module\s*\d+/i,
];

const SCHEDULE_INDICATORS = [
  /schedule/i,
  /timetable/i,
  /calendar/i,
  /plan.*week/i,
  /plan.*day/i,
];

// Detect when query is about student-specific context and should use internal tools.
const STUDENT_CONTEXT_PATTERNS = [
  /\bmoodle\b/i,
  /\bstudydeck\b/i,
  /\bcourse\s+code\b/i,
  /\bhandout\b/i,
  /\bsyllabus\b/i,
  /\blab\s*\d+/i,
  /\blecture\s*\d+/i,
  /\bassignment\s*\d+/i,
  /\bmodule\s*\d+/i,
  /\bmaterials?\b/i,
  /\bnotes?\b/i,
  /\bslides?\b/i,
  /\benroll/i,
  /\bprofessor\b/i,
  /\bsemester\b/i,
  /\bcgpa\b/i,
  /\bcredits?\b/i,
  /\b(my|our)\s+(?:course|courses|class|classes|schedule|timetable|tasks|dashboard|notifications?|assignments?)\b/i,
  /\bwhat\s+courses\s+am\s+i\b/i,
  /\bclass\s+schedule\b/i,
  /\b(cs|bio|math|phy|chem|eee)\s*[a-z]?\s*\d{3}(?:-\d+)?\b/i,
  /\blab\s*\d+\s+of\s+cs\b/i,
  /\bcs\b.*\blab\s*\d+/i,
  /\b(previous|earlier|last)\s+(message|query|question|chat)\b/i,
  /\bwhat\s+did\s+i\s+(ask|say)\b/i,
  /\bwe\s+(talked|discussed)\b/i,
];

/**
 * Classify query complexity and recommend appropriate model
 */
export function classifyQuery(query: string, format?: string): ClassificationResult {
  const reasons: string[] = [];
  let complexity: QueryComplexity = 'medium'; // Default
  let confidence = 0.5;

  // Check for simple patterns
  const isSimple = SIMPLE_PATTERNS.some(p => p.test(query));
  if (isSimple) {
    complexity = 'simple';
    confidence = 0.9;
    reasons.push('Matches simple query pattern');
  }

  // Check for complex patterns
  const isComplex = COMPLEX_PATTERNS.some(p => p.test(query));
  if (isComplex) {
    complexity = 'complex';
    confidence = 0.9;
    reasons.push('Matches complex query pattern');
  }

  // Check for PDF analysis needs
  const needsPDF = PDF_INDICATORS.some(p => p.test(query));
  if (needsPDF) {
    complexity = 'complex';
    confidence = 0.95;
    reasons.push('Requires PDF analysis');
  }

  // Check for schedule/planning needs
  const needsScheduling = SCHEDULE_INDICATORS.some(p => p.test(query));
  if (needsScheduling && (format === 'schedule' || format === 'overview')) {
    complexity = 'complex';
    confidence = 0.95;
    reasons.push('Requires complex scheduling/planning');
  }

  // Check for multiple tool needs
  const needsMultipleTools = MULTI_TOOL_INDICATORS.some(p => p.test(query));
  if (needsMultipleTools) {
    if (complexity === 'simple') complexity = 'medium';
    confidence = Math.min(confidence + 0.1, 1.0);
    reasons.push('Requires multiple tools');
  }

  // Query length heuristic
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 20 && complexity === 'simple') {
    complexity = 'medium';
    reasons.push('Long query suggests complexity');
  }

  // Format override
  if (format === 'schedule' || format === 'overview') {
    if (complexity !== 'complex') {
      complexity = 'complex';
      confidence = 0.85;
      reasons.push('Format requires advanced reasoning');
    }
  }

  // Determine recommended model
  const modelMap: Record<QueryComplexity, string> = {
    simple: 'gemini-3-flash-preview',
    medium: 'gemini-3-flash-preview',
    complex: 'gemini-3-flash-preview',
  };

  const recommendedModel = modelMap[complexity];

  return {
    complexity,
    confidence,
    reasons,
    recommendedModel,
  };
}

/**
 * Get estimated response time for a complexity level
 */
export function getEstimatedResponseTime(complexity: QueryComplexity): number {
  const timeMap: Record<QueryComplexity, number> = {
    simple: 500,   // 500ms
    medium: 800,   // 800ms
    complex: 2500, // 2.5s
  };
  return timeMap[complexity];
}

/**
 * Determine whether a query is BITS/student-context specific.
 * If false, route to general-world knowledge path.
 */


export function isStudentContextQuery(_query: string): boolean {
  // Priority: always route through student-context agent first.
  // The agent will answer general questions directly without tools when appropriate.
  return true;
}

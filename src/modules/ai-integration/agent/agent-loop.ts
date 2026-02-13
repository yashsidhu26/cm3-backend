/**
 * Core Agent Loop Implementation
 * Orchestrates Gemini function calling with tool execution via Vertex AI
 */

import { GoogleGenAI, FunctionCallingConfigMode, type GenerateContentResponse } from '@google/genai';
import type { ChatMessage, ResponseFormat } from '../types';
import type { AgentAIResponse, ToolCallDetail, ToolExecutionResult } from './types';
import { toolDefinitions } from './tool-definitions';
import { executeToolCall } from './tool-registry';
import { buildAgentSystemPrompt } from './system-prompt';
import { isStudentContextQuery, isLikelyStudentContext } from '../query-classifier';

const MAX_ITERATIONS = 10; // Reduced to avoid rate limits
const TOTAL_TIMEOUT_MS = 120000; // 120 seconds (2 minutes) - generous timeout
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry API call with exponential backoff for 429 errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a 429 rate limit error
      const is429 = error.message?.includes('429') ||
        error.message?.includes('Too Many Requests') ||
        error.message?.includes('RESOURCE_EXHAUSTED');

      if (is429 && attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.log(`[Agent] Rate limit hit (429) on ${context}, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      // If not 429 or max retries reached, throw
      throw error;
    }
  }

  throw lastError;
}

/**
 * Extract function calls from Vertex AI response
 * Response structure varies by endpoint/model
 */
function extractFunctionCalls(result: any, fallbackThoughtSignature?: string): any[] {
  // Parse from response structure (new SDK: result is the response)
  // candidates are at top level of result
  const parts = result.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part: any) => part.functionCall)
    .map((part: any) => {
      const call = { ...part.functionCall };
      const thoughtSignature = part.thoughtSignature || part.thought_signature || fallbackThoughtSignature;
      // Preserve thought_signature from the original part (required for Vertex AI)
      if (thoughtSignature) {
        call.thoughtSignature = thoughtSignature;
        call.thought_signature = thoughtSignature;
      }
      return call;
    });
}

function buildCompactHistory(conversationHistory: ChatMessage[]): any[] {
  return conversationHistory
    .filter((msg) => msg.content && msg.content !== '[No response generated]')
    .slice(-6)
    .map((msg) => {
      const trimmedContent =
        msg.content.length > 1200 ? `${msg.content.slice(0, 1200)} [truncated]` : msg.content;
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: trimmedContent }],
      };
    });
}

type ResourceKind = 'lab' | 'tutorial' | 'lecture' | 'slides' | 'assignment' | 'sheet' | 'module';

function extractResourceRequest(query: string): { kind: ResourceKind; number?: string; subject: string } | null {
  const kindMap: Array<{ kind: ResourceKind; re: RegExp }> = [
    { kind: 'lab', re: /\blab\b/i },
    { kind: 'tutorial', re: /\b(tutorial|tut)\b/i },
    { kind: 'lecture', re: /\b(lecture|lec)\b/i },
    { kind: 'slides', re: /\b(slide|slides|ppt|presentation|deck)\b/i },
    { kind: 'assignment', re: /\b(assignment|assgn|assign)\b/i },
    { kind: 'sheet', re: /\b(sheet)\b/i },
    { kind: 'module', re: /\b(module|mod)\b/i },
  ];

  const kindEntry = kindMap.find((k) => k.re.test(query));
  if (!kindEntry) return null;

  const numberMatch = query.match(/\b(?:lab|lecture|lec|tutorial|tut|assignment|assgn|assign|sheet|module|mod)\s*(\d+)\b/i);
  const number = numberMatch ? numberMatch[1] : undefined;

  if (/\bcs\b/i.test(query) || /computer\s+science/i.test(query)) {
    return { kind: kindEntry.kind, number, subject: 'CS' };
  }
  return { kind: kindEntry.kind, number, subject: '' };
}

function pickCourseForSubject(courses: any[], subject: string): any | null {
  if (!courses || courses.length === 0) return null;
  const getCourse = (entry: any) => entry?.course || entry;
  if (!subject) {
    if (courses.length === 1) return getCourse(courses[0]) || null;
    return null;
  }
  const subjectPrefix = subject.toUpperCase();
  const match = courses.find((c: any) => getCourse(c)?.code?.toUpperCase()?.startsWith(subjectPrefix));
  return getCourse(match) || null;
}

function extractCourseCode(query: string): string | null {
  const match = query.match(/\b([A-Z]{2,4})\s*([A-Z]?\d{3})\b/i);
  if (!match) return null;
  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

function findCourseResource(resources: any[], kind: ResourceKind, number?: string): any | null {
  if (!resources || resources.length === 0) return null;
  const kindTokens: Record<ResourceKind, string[]> = {
    lab: ['lab', 'lab sheet'],
    tutorial: ['tutorial', 'tut', 'tutorial sheet'],
    lecture: ['lecture', 'lec'],
    slides: ['slide', 'slides', 'ppt', 'presentation', 'deck'],
    assignment: ['assignment', 'assgn', 'assign'],
    sheet: ['sheet'],
    module: ['module', 'mod'],
  };

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const tokens = kindTokens[kind].map(normalize);
  const numberRe = number ? new RegExp(`\\b${number}\\b`) : null;

  return resources.find((r: any) => {
    const name = r?.name || '';
    if (!name) return false;
    const normalized = normalize(name);
    const hasKind = tokens.some((t) => normalized.includes(t));
    const hasNumber = numberRe ? numberRe.test(normalized) : true;
    return hasKind && hasNumber;
  }) || null;
}

function mapStudydeckResourceType(kind: ResourceKind): 'slides' | 'notes' | 'papers' | 'all' {
  switch (kind) {
    case 'slides':
    case 'lecture':
    case 'module':
      return 'slides';
    case 'assignment':
    case 'tutorial':
    case 'lab':
    case 'sheet':
      return 'notes';
    default:
      return 'all';
  }
}

/**
 * Determine which model to use based on query complexity
 * - gemini-3-flash-preview: All queries (temporarily forced by user)
 *
 * TEMPORARY: User requested to force gemini-3-flash-preview for everything
 * and use regional endpoint (global) instead of global
 */
function selectModel(query: string, format?: ResponseFormat): string {
  // TEMPORARY: Force gemini-3-flash-preview for ALL queries (user request)
  const model = 'gemini-3-flash-preview';

  console.log(`[Agent] Using model: ${model} (forced for all queries)`);

  return model;
}

/**
 * Run the agent loop with Gemini function calling
 */
export async function runAgentLoop(
  userId: string,
  query: string,
  conversationHistory: ChatMessage[],
  format?: ResponseFormat
): Promise<AgentAIResponse> {
  const startTime = Date.now();
  const projectId = process.env.GCP_PROJECT_ID;

  if (!projectId) {
    throw new AgentError('GCP_PROJECT_ID not configured', 'MISSING_PROJECT_ID', 500);
  }

  const toolResultCache = new Map<string, ToolExecutionResult>();
  let cachedToolContextText: string | null = null;
  const buildToolKey = (name: string, args: Record<string, any>) =>
    `${name}:${JSON.stringify(args || {})}`;
  const callToolCached = async (name: string, args: Record<string, any>) => {
    const key = buildToolKey(name, args);
    const cached = toolResultCache.get(key);
    if (cached) return cached;
    const result = await executeToolCall(name, args, userId);
    toolResultCache.set(key, result);
    return result;
  };
  const buildCachedToolContext = (cache: Map<string, ToolExecutionResult>): string | null => {
    if (cache.size === 0) return null;
    const context: any = {};

    for (const [key, value] of cache.entries()) {
      const idx = key.indexOf(':');
      const name = idx === -1 ? key : key.slice(0, idx);
      const argsStr = idx === -1 ? '{}' : key.slice(idx + 1);
      let args: any = {};
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      if (name === 'get_enrolled_courses') {
        const courses = Array.isArray(value?.response?.data) ? value.response.data : [];
        context.get_enrolled_courses = courses.map((c: any) => ({
          code: (c?.course || c)?.code,
          id: (c?.course || c)?.id,
          name: (c?.course || c)?.name,
        })).filter((c: any) => c.code);
      }

      if (name === 'get_course_full_details') {
        const course = value?.response?.data;
        const keyLabel = `get_course_full_details:${args.code || 'unknown'}`;
        if (course && !course?.message) {
          context[keyLabel] = {
            id: course.id,
            code: course.code,
            name: course.name,
            resources: Array.isArray(course.resources)
              ? course.resources.map((r: any) => ({
                name: r?.name,
                fileUrl: r?.fileUrl,
                type: r?.type,
              })).filter((r: any) => r.name)
              : [],
          };
        }
      }

      if (name === 'get_course_resources') {
        const resources = Array.isArray(value?.response?.data) ? value.response.data : [];
        const keyLabel = `get_course_resources:${args.courseId || 'unknown'}`;
        context[keyLabel] = resources.slice(0, 25).map((r: any) => ({
          name: r?.name,
          fileUrl: r?.fileUrl,
        })).filter((r: any) => r.name);
      }

      if (name === 'search_studydeck_resources') {
        const docs = Array.isArray(value?.response?.data?.documents)
          ? value.response.data.documents
          : [];
        const keyLabel = `search_studydeck_resources:${args.courseCode || 'unknown'}`;
        context[keyLabel] = docs.slice(0, 25).map((d: any) => ({
          name: d?.name,
          downloadUrl: d?.downloadUrl,
        })).filter((d: any) => d.name);
      }
    }

    if (Object.keys(context).length === 0) return null;
    return `Context (tool results already fetched in this request, do NOT re-fetch unless needed):\n${JSON.stringify(context)}`;
  };

  // Select model first
  const selectedModel = selectModel(query, format);

  // TEMPORARY: Force global location with standard API endpoint
  const location = 'global';
  const apiEndpoint = 'aiplatform.googleapis.com';

  console.log(`[Agent] Model: ${selectedModel}, Location: ${location}, Endpoint: ${apiEndpoint}`);

  const ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
  });

  console.log(`[Agent] Using model: ${selectedModel}`);

  // Route non-student queries to general knowledge path with web grounding.
  if (!isStudentContextQuery(query)) {
    const contents: any[] = [
      ...buildCompactHistory(conversationHistory),
      { role: 'user', parts: [{ text: query }] },
    ];

    const googleSearchRetrievalTool: any = {
      googleSearch: {},
    };

    let result: GenerateContentResponse;
    try {
      result = await retryWithBackoff(
        () => ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: {
              parts: [{
                text: `You are a general-purpose assistant.
- Answer real-world questions directly.
- Resolve pronouns using recent chat context; only ask for clarification if multiple plausible referents exist.
- Use Google Search grounding when useful for factual accuracy.
- Keep responses concise and clear.` }]
            },
            tools: [googleSearchRetrievalTool],
          }
        }),
        'general query (grounded)'
      );
    } catch (groundingError: any) {
      console.warn('[Agent] Grounded general query failed, retrying without grounding:', groundingError?.message || groundingError);
      result = await retryWithBackoff(
        () => ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: {
              parts: [{
                text: `You are a general-purpose assistant.
- Answer real-world questions directly.
- Resolve pronouns using recent chat context; only ask for clarification if multiple plausible referents exist.
- Use Google Search grounding when useful for factual accuracy.
- Keep responses concise and clear.` }]
            },
          }
        }),
        'general query (fallback)'
      );
    }

    const finalText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!finalText) {
      throw new AgentError('Gemini returned empty response for general query', 'EMPTY_GENERAL_RESPONSE', 500);
    }

    return {
      response: finalText,
      source: 'gemini-agent',
      complexity: 'general',
      toolsUsed: ['google_search'],
      iterations: 1,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        model: selectedModel,
        totalToolCalls: 0,
        toolCallDetails: [],
      },
    };
  }

  // Fast-path: course material queries should use Moodle course resources first (no StudyDeck).
  const resourceRequest = extractResourceRequest(query);
  if (resourceRequest) {
    const { kind, number, subject } = resourceRequest;
    const toolsUsed: string[] = [];
    const toolCallDetails: ToolCallDetail[] = [];
    let fallbackToAgent = false;

    do {
      const courseCode = extractCourseCode(query);
      let course: any | null = null;
      let resources: any[] = [];

      if (courseCode) {
        const courseStart = Date.now();
        const courseResult = await callToolCached('get_course_full_details', { code: courseCode });
        toolCallDetails.push({
          tool: 'get_course_full_details',
          durationMs: Date.now() - courseStart,
          success: Boolean(courseResult?.response?.success),
          args: { code: courseCode },
          result: courseResult?.response?.data,
        });
        toolsUsed.push('get_course_full_details');

        const courseData = courseResult?.response?.data;
        course = courseData && !courseData?.message ? courseData : null;
        resources = Array.isArray(courseData?.resources) ? courseData.resources : [];

        if (!course?.id) {
          fallbackToAgent = true;
          break;
        }
      } else {
        const enrolledStart = Date.now();
        const enrolled = await callToolCached('get_enrolled_courses', {});
        toolCallDetails.push({
          tool: 'get_enrolled_courses',
          durationMs: Date.now() - enrolledStart,
          success: Boolean(enrolled?.response?.success),
          result: enrolled?.response?.data,
        });
        toolsUsed.push('get_enrolled_courses');

        const enrolledCourses = enrolled?.response?.data || [];
        const picked = pickCourseForSubject(enrolledCourses, subject);

        if (!picked?.code) {
          fallbackToAgent = true;
          break;
        }

        const courseStart = Date.now();
        const courseResult = await callToolCached('get_course_full_details', { code: picked.code });
        toolCallDetails.push({
          tool: 'get_course_full_details',
          durationMs: Date.now() - courseStart,
          success: Boolean(courseResult?.response?.success),
          args: { code: picked.code },
          result: courseResult?.response?.data,
        });
        toolsUsed.push('get_course_full_details');

        const courseData = courseResult?.response?.data;
        course = courseData && !courseData?.message ? courseData : null;
        resources = Array.isArray(courseData?.resources) ? courseData.resources : [];

        if (!course?.id) {
          fallbackToAgent = true;
          break;
        }
      }

      const match = findCourseResource(resources, kind, number);

      if (!match?.fileUrl) {
        // Fallback: StudyDeck search only if Moodle has no matching resource.
        const resourceType = mapStudydeckResourceType(kind);
        const studydeckStart = Date.now();
        const studydeckResult = await callToolCached('search_studydeck_resources', {
          resourceType,
          courseCode: course.code,
        });
        toolCallDetails.push({
          tool: 'search_studydeck_resources',
          durationMs: Date.now() - studydeckStart,
          success: Boolean(studydeckResult?.response?.success),
          args: { resourceType, courseCode: course.code },
          result: studydeckResult?.response?.data,
        });
        toolsUsed.push('search_studydeck_resources');

        const documents = studydeckResult?.response?.data?.documents || [];
        const sdMatch = findCourseResource(documents, kind, number);

        if (sdMatch?.downloadUrl) {
          const analysisStart = Date.now();
          const analysisResult = await callToolCached('analyze_pdf_document', {
            pdfUrl: sdMatch.downloadUrl,
            documentName: sdMatch.name || `${kind.toUpperCase()} ${number ?? ''}`.trim(),
          });
          toolCallDetails.push({
            tool: 'analyze_pdf_document',
            durationMs: Date.now() - analysisStart,
            success: Boolean(analysisResult?.response?.success),
            args: { pdfUrl: sdMatch.downloadUrl, documentName: sdMatch.name || `${kind.toUpperCase()} ${number ?? ''}`.trim() },
            result: analysisResult?.response?.data,
          });
          toolsUsed.push('analyze_pdf_document');

          const analysis = analysisResult?.response?.data?.analysis || analysisResult?.response?.data?.summary;
          const fallback = analysisResult?.response?.data?.message || 'Unable to analyze the StudyDeck PDF.';

          return {
            response: analysis || fallback,
            source: 'gemini-agent',
            complexity: 'agent',
            toolsUsed,
            iterations: 1,
            metadata: {
              processingTimeMs: Date.now() - startTime,
              model: selectedModel,
              totalToolCalls: toolsUsed.length,
              toolCallDetails,
            },
          };
        }

        fallbackToAgent = true;
        break;
      }

      const analysisStart = Date.now();
      const analysisResult = await callToolCached('analyze_pdf_document', {
        pdfUrl: match.fileUrl,
        documentName: match.name || `${kind.toUpperCase()} ${number ?? ''}`.trim(),
      });
      toolCallDetails.push({
        tool: 'analyze_pdf_document',
        durationMs: Date.now() - analysisStart,
        success: Boolean(analysisResult?.response?.success),
        args: { pdfUrl: match.fileUrl, documentName: match.name || `${kind.toUpperCase()} ${number ?? ''}`.trim() },
        result: analysisResult?.response?.data,
      });
      toolsUsed.push('analyze_pdf_document');

      const analysis = analysisResult?.response?.data?.analysis || analysisResult?.response?.data?.summary;
      const fallback = analysisResult?.response?.data?.message || 'Unable to analyze the lab PDF.';

      return {
        response: analysis || fallback,
        source: 'gemini-agent',
        complexity: 'agent',
        toolsUsed,
        iterations: 1,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          model: selectedModel,
          totalToolCalls: toolsUsed.length,
          toolCallDetails,
        },
      };
    } while (false);

    if (fallbackToAgent) {
      cachedToolContextText = buildCachedToolContext(toolResultCache);
    }

  }

  // Build system prompt
  const systemPrompt = buildAgentSystemPrompt(format);

  // Initialize history with manual management
  // We use this instead of chat.sendMessage to ensure we can patch thoughtSignatures
  // Note: history must alternate user/model
  const history: any[] = [
    ...buildCompactHistory(conversationHistory),
    ...(cachedToolContextText ? [{ role: 'user', parts: [{ text: cachedToolContextText }] }] : []),
    // Add the current user query
    { role: 'user', parts: [{ text: query }] }
  ];

  // Tracking
  const toolCallDetails: ToolCallDetail[] = [];
  const toolsUsed = new Set<string>();
  let iterations = 0;

  try {
    // Initial request
    let result = await retryWithBackoff(
      () => ai.models.generateContent({
        model: selectedModel,
        contents: history,
        config: {
          // @ts-ignore
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // @ts-ignore
          tools: [{ functionDeclarations: toolDefinitions }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        }
      }),
      'initial query'
    );
    iterations++;

    // Agent loop
    while (iterations < MAX_ITERATIONS) {
      if (iterations > 1) await sleep(200);
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn('[Agent] Total timeout exceeded, forcing final answer');
        break;
      }

      // 1. Add Model Response to History (with thoughtSignature if present)
      const candidates = result.candidates;
      if (candidates && candidates.length > 0) {
        const modelContent = candidates[0].content;
        const modelParts = (modelContent?.parts || []) as any[];
        const signaturePart = modelParts.find((p: any) => p.thoughtSignature || p.thought_signature);
        const responseThoughtSignature = signaturePart?.thoughtSignature || signaturePart?.thought_signature;

        // CRITICAL FIX: Explicitly preserve thoughtSignature in the history
        // We reconstruct the parts to ensure thoughtSignature is included
        const historyParts = modelParts.map((part: any) => {
          const newPart: any = { ...part };
          const partThoughtSignature = part.thoughtSignature || part.thought_signature || responseThoughtSignature;
          // If the part has a function call, check for thoughtSignature in the original part
          // Note: Vertex AI puts thoughtSignature on the part object itself, usually alongside functionCall
          if (part.functionCall && partThoughtSignature) {
            newPart.thoughtSignature = partThoughtSignature;
            newPart.thought_signature = partThoughtSignature;
          }
          return newPart;
        });

        history.push({
          role: 'model',
          parts: historyParts
        });
      }

      // Check for function calls
      const responseParts = (result.candidates?.[0]?.content?.parts || []) as any[];
      const responseSignaturePart = responseParts.find((p: any) => p.thoughtSignature || p.thought_signature);
      const fallbackThoughtSignature = responseSignaturePart?.thoughtSignature || responseSignaturePart?.thought_signature;
      const functionCalls = extractFunctionCalls(result, fallbackThoughtSignature);

      if (!functionCalls || functionCalls.length === 0) {
        // Final answer found
        const finalText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (finalText) {
          return {
            response: finalText,
            source: 'gemini-agent',
            complexity: 'agent',
            toolsUsed: Array.from(toolsUsed),
            iterations,
            metadata: {
              processingTimeMs: Date.now() - startTime,
              model: selectedModel,
              totalToolCalls: toolCallDetails.length,
              toolCallDetails,
            },
          };
        }

        // If we extracted function calls but extractFunctionCalls returned empty (e.g. malformed), handle it
        // But extractFunctionCalls handles fallback.
        // If we are here, essentially we are done or stuck.
        // Let's assume done if text exists, else error.
        throw new AgentError('Gemini returned neither function calls nor text', 'INVALID_RESPONSE', 500);
      }

      // Execute function calls
      console.log(`[Agent] Executing ${functionCalls.length} tool calls...`);
      const toolStartTime = Date.now();

      const toolResults = await Promise.allSettled(
        functionCalls.map((call: any) => {
          toolsUsed.add(call.name);
          return callToolCached(call.name, call.args || {});
        })
      );

      // Build function response parts
      const functionResponseParts = toolResults.map((res, index) => {
        const call = functionCalls[index];
        const toolDuration = Date.now() - toolStartTime;

        if (res.status === 'fulfilled') {
          const { name, response } = res.value;
          toolCallDetails.push({ tool: name, durationMs: toolDuration, success: !response.error, error: response.error });

          return {
            functionResponse: { name, response }
            // Some newer Vertex models might want thoughtSignature here too, but start without it
            // as the error specifically mentioned "function call ... in the 14. content block" (history)
          };
        } else {
          toolCallDetails.push({ tool: call.name, durationMs: toolDuration, success: false, error: res.reason?.message });
          return {
            functionResponse: {
              name: call.name,
              response: { error: res.reason?.message || 'Tool execution failed' }
            }
          };
        }
      });

      // 2. Add Function Responses to History
      history.push({
        role: 'user',
        parts: functionResponseParts
      });

      // 3. Generate Next Response
      result = await retryWithBackoff(
        () => ai.models.generateContent({
          model: selectedModel,
          contents: history,
          config: {
            // @ts-ignore
            systemInstruction: { parts: [{ text: systemPrompt }] },
            // @ts-ignore
            tools: [{ functionDeclarations: toolDefinitions }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          }
        }),
        'function responses'
      );
      iterations++;
    }

    // Force final answer if max iterations reached
    console.warn('[Agent] Max iterations reached, forcing final answer');

    // Try to get text from last result
    const finalText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (finalText) {
      return {
        response: finalText,
        source: 'gemini-agent',
        complexity: 'agent',
        toolsUsed: Array.from(toolsUsed),
        iterations,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          model: selectedModel,
          totalToolCalls: toolCallDetails.length,
          toolCallDetails,
        },
      };
    }

    // If still no text, just return error or fallback
    return {
      response: 'I reached the maximum number of steps and could not complete the request.',
      source: 'gemini-agent',
      complexity: 'agent',
      toolsUsed: Array.from(toolsUsed),
      iterations,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        model: selectedModel,
        totalToolCalls: toolCallDetails.length,
        toolCallDetails,
      }
    };

  } catch (error: any) {
    console.error('[Agent] Error in agent loop:', error);
    if (error instanceof AgentError) throw error;

    // Check if it's a rate limit error
    const is429 = error.message?.includes('429') ||
      error.message?.includes('Too Many Requests') ||
      error.message?.includes('RESOURCE_EXHAUSTED');

    if (is429) {
      throw new AgentError(
        'Rate limit exceeded. Please wait a moment and try again.',
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    throw new AgentError(
      `Agent execution failed: ${error.message}`,
      'AGENT_EXECUTION_FAILED',
      500
    );
  }
}

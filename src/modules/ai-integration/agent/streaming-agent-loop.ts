/**
 * Streaming Agent Loop
 * Yields status events during agent execution including tool usage
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import type { ChatMessage, ResponseFormat } from '../types';
import type { ToolCallDetail, ToolExecutionResult } from './types';
import { toolDefinitions } from './tool-definitions';
import type { FunctionDeclaration, Schema, Type } from '@google/genai';
import { executeToolCall } from './tool-registry';
import { buildAgentSystemPrompt } from './system-prompt';
import { getToolMessage, shouldNotifyToolUse } from '../tool-messages';
import { isStudentContextQuery } from '../query-classifier';

const MAX_ITERATIONS = 5; // Reduced to avoid rate limits
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export interface StreamEvent {
  type: 'status' | 'tool' | 'thinking' | 'chunk' | 'complete' | 'error';
  data: any;
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
        console.log(`[StreamingAgent] Rate limit hit (429) on ${context}, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
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
 * Handles both streaming and non-streaming response formats
 */
function extractFunctionCalls(result: any, fallbackThoughtSignature?: string): any[] {
  if (typeof result.response?.functionCalls === 'function') {
    return result.response.functionCalls().map((call: any) => {
      if (!fallbackThoughtSignature) return call;
      return {
        ...call,
        thoughtSignature: call.thoughtSignature || call.thought_signature || fallbackThoughtSignature,
        thought_signature: call.thought_signature || call.thoughtSignature || fallbackThoughtSignature,
      };
    });
  }

  // Try streaming format first (result.candidates)
  let parts = result.candidates?.[0]?.content?.parts;

  // Fall back to non-streaming format (result.response.candidates)
  if (!parts) {
    parts = result.response?.candidates?.[0]?.content?.parts;
  }

  if (!parts) {
    return [];
  }

  return parts
    .filter((part: any) => part.functionCall)
    .map((part: any) => {
      const call = { ...part.functionCall };
      const thoughtSignature = part.thoughtSignature || part.thought_signature || fallbackThoughtSignature;
      // Preserve thought_signature for Vertex AI requirement
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
  // Check for other common subjects like CSE, ECE, ME, etc.
  const subjectMatch = query.match(/\b([A-Z]{2,3})\b/);
  if (subjectMatch && !['LAB', 'TUT', 'LEC'].includes(subjectMatch[1].toUpperCase())) {
    return { kind: kindEntry.kind, number, subject: subjectMatch[1].toUpperCase() };
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
  // Try exact start match first
  let match = courses.find((c: any) => getCourse(c)?.code?.toUpperCase()?.startsWith(subjectPrefix));

  // If not found, try flexible matching for CS -> CSE/CS
  if (!match && subjectPrefix === 'CS') {
    match = courses.find((c: any) => getCourse(c)?.code?.toUpperCase()?.startsWith('CSE'));
  }

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
 * Run agent loop with streaming events
 */
export async function* runStreamingAgentLoop(
  userId: string,
  query: string,
  conversationHistory: ChatMessage[],
  format?: ResponseFormat
): AsyncGenerator<StreamEvent, void, unknown> {
  const projectId = process.env.GCP_PROJECT_ID;

  if (!projectId) {
    yield { type: 'error', data: { error: 'GCP_PROJECT_ID not configured' } };
    return;
  }

  yield { type: 'status', data: { status: 'initializing', message: '🤖 Starting AI agent...' } };

  // Use the configured model from .env with global for better streaming
  const selectedModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const location = 'global'; // Regional endpoint for better streaming performance

  console.log(`[StreamingAgent] Using model: ${selectedModel} in ${location}`);

  console.log(`[StreamingAgent] Using model: ${selectedModel} in ${location}`);

  const ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location,
  });

  yield { type: 'status', data: { status: 'analyzing', message: '🔍 Analyzing your query...' } };

  const toolResultCache = new Map<string, ToolExecutionResult>();
  let cachedToolContextText: string | null = null;
  const buildToolKey = (name: string, args: Record<string, any>) =>
    `${name}:${JSON.stringify(args || {})}`;
  const callToolCached = async (name: string, args: Record<string, any>) => {
    const key = buildToolKey(name, args);
    const cached = toolResultCache.get(key);
    if (cached) {
      console.log(`[StreamingAgent] Cache hit for tool: ${name}`);
      return cached;
    }
    const result = await executeToolCall(name, args, userId);
    toolResultCache.set(key, result);
    return result;
  };
  const isToolCached = (name: string, args: Record<string, any>) => {
    const key = buildToolKey(name, args);
    return toolResultCache.has(key);
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
        // Include ALL resources with full details for better matching
        context[keyLabel] = resources.map((r: any) => ({
          name: r?.name,
          fileUrl: r?.fileUrl,
          type: r?.type,
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
    return `IMPORTANT: The following data has already been fetched. DO NOT call these tools again - use this data to answer the user's question:\n\n${JSON.stringify(context, null, 2)}\n\nUse this data to help the user. If you see resources that match their request, provide the information or fileUrl.`;
  };

  // Route non-student queries to general knowledge path with web grounding.
  if (!isStudentContextQuery(query)) {
    const generalSystemPrompt = `You are a general-purpose assistant.
- Answer real-world questions directly.
- Resolve pronouns using recent chat context; only ask for clarification if multiple plausible referents exist.
- Use Google Search grounding when useful for factual accuracy.
- Keep responses concise and clear.`;

    const contents: any[] = [
      ...buildCompactHistory(conversationHistory),
      { role: 'user', parts: [{ text: query }] },
    ];

    const googleSearchRetrievalTool: any = {
      googleSearch: {},
    };

    let streamResult: any;
    try {
      streamResult = await retryWithBackoff(
        () => ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: { parts: [{ text: generalSystemPrompt }] },
            tools: [googleSearchRetrievalTool],
          }
        }),
        'general query (grounded)'
      );
    } catch (groundingError: any) {
      console.warn('[StreamingAgent] Grounded general query failed, retrying without grounding:', groundingError?.message || groundingError);
      streamResult = await retryWithBackoff(
        () => ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: { parts: [{ text: generalSystemPrompt }] },
          }
        }),
        'general query (fallback)'
      );
    }

    yield { type: 'status', data: { status: 'responding', message: '✍️ Generating response...' } };

    let emittedAnyChunk = false;
    let generalChunkCount = 0;
    for await (const chunk of streamResult) {
      const receiveTime = Date.now();
      const chunkText = chunk.text;
      if (chunkText !== undefined) {
        generalChunkCount++;
        console.log(`[StreamingAgent] General chunk #${generalChunkCount} received at ${receiveTime}, length: ${chunkText.length}`);
      }
      if (chunkText) {
        emittedAnyChunk = true;
        const yieldTime = Date.now();
        console.log(`[StreamingAgent] Yielding general chunk #${generalChunkCount} at ${yieldTime} (delta: ${yieldTime - receiveTime}ms)`);
        yield { type: 'chunk', data: { text: chunkText } };
      }
    }
    console.log(`[StreamingAgent] General stream chunks received:`, generalChunkCount);

    if (!emittedAnyChunk) {
      const finalResult = await streamResult.response;
      const finalText = finalResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (finalText) {
        yield { type: 'chunk', data: { text: finalText } };
      }
    }

    yield {
      type: 'complete',
      data: {
        status: 'complete',
        toolsUsed: ['google_search'],
        iterations: 1,
      },
    };
    return;
  }

  // Fast-path: course material queries should use Moodle course resources first (no StudyDeck).
  const resourceRequest = extractResourceRequest(query);
  if (resourceRequest) {
    console.log(`[StreamingAgent] Fast-path resource request detected:`, resourceRequest);
    const { kind, number, subject } = resourceRequest;
    const toolsUsed: string[] = [];
    let fallbackToAgent = false;

    do {
      const courseCode = extractCourseCode(query);
      console.log(`[StreamingAgent] Extracted course code:`, courseCode);
      let course: any | null = null;
      let resources: any[] = [];

      if (courseCode) {
        if (shouldNotifyToolUse('get_course_full_details')) {
          yield {
            type: 'tool',
            data: { tool: 'get_course_full_details', message: getToolMessage('get_course_full_details'), args: { code: courseCode } },
          };
        }
        toolsUsed.push('get_course_full_details');
        const courseResult = await callToolCached('get_course_full_details', { code: courseCode });
        const courseData = courseResult?.response?.data;
        course = courseData && !courseData?.message ? courseData : null;
        resources = Array.isArray(courseData?.resources) ? courseData.resources : [];

        if (!course?.id) {
          console.log(`[StreamingAgent] Course not found for code:`, courseCode);
          fallbackToAgent = true;
          break;
        }
      } else {
        // 1) get_enrolled_courses
        if (shouldNotifyToolUse('get_enrolled_courses')) {
          yield {
            type: 'tool',
            data: { tool: 'get_enrolled_courses', message: getToolMessage('get_enrolled_courses'), args: {} },
          };
        }
        toolsUsed.push('get_enrolled_courses');
        const enrolled = await callToolCached('get_enrolled_courses', {});
        const enrolledCourses = enrolled?.response?.data || [];
        console.log(`[StreamingAgent] Enrolled courses found:`, enrolledCourses.length);
        console.log(`[StreamingAgent] Enrolled course codes:`, enrolledCourses.map((c: any) => (c?.course || c)?.code));

        const picked = pickCourseForSubject(enrolledCourses, subject);
        console.log(`[StreamingAgent] Picked course for subject '${subject}':`, picked?.code || 'None');

        if (!picked?.code) {
          console.log(`[StreamingAgent] No matching enrolled course found for subject:`, subject);
          fallbackToAgent = true;
          break;
        }

        if (shouldNotifyToolUse('get_course_full_details')) {
          yield {
            type: 'tool',
            data: { tool: 'get_course_full_details', message: getToolMessage('get_course_full_details'), args: { code: picked.code } },
          };
        }
        toolsUsed.push('get_course_full_details');
        const courseResult = await callToolCached('get_course_full_details', { code: picked.code });
        const courseData = courseResult?.response?.data;
        course = courseData && !courseData?.message ? courseData : null;
        resources = Array.isArray(courseData?.resources) ? courseData.resources : [];

        if (!course?.id) {
          fallbackToAgent = true;
          break;
        }
      }

      console.log(`[StreamingAgent] Resources found:`, resources.length);
      console.log(`[StreamingAgent] Looking for kind="${kind}" number="${number}"`);
      console.log(`[StreamingAgent] Resource names:`, resources.slice(0, 10).map((r: any) => r?.name));
      const match = findCourseResource(resources, kind, number);
      console.log(`[StreamingAgent] Moodle match:`, match?.name || null);

      if (!match) {
        console.log(`[StreamingAgent] NO MATCH FOUND - Fast-path will fall back`);
      }

      if (!match?.fileUrl) {
        // No Moodle match - let the full agent handle it with the cached context
        // The agent can see all resources and provide better assistance
        console.log(`[StreamingAgent] No Moodle match, falling back to full agent with cached context`);
        fallbackToAgent = true;
        break;
      }

      // 3) analyze_pdf_document
      if (shouldNotifyToolUse('analyze_pdf_document')) {
        yield {
          type: 'tool',
          data: {
            tool: 'analyze_pdf_document',
            message: getToolMessage('analyze_pdf_document'),
            args: {
              pdfUrl: match.fileUrl,
              documentName: match.name || `${kind.toUpperCase()} ${number ?? ''}`.trim(),
            },
          },
        };
      }
      toolsUsed.push('analyze_pdf_document');
      const analysisResult = await callToolCached('analyze_pdf_document', {
        pdfUrl: match.fileUrl,
        documentName: match.name || `${kind.toUpperCase()} ${number ?? ''}`.trim(),
      });

      const analysis = analysisResult?.response?.data?.analysis || analysisResult?.response?.data?.summary;
      const fallback = analysisResult?.response?.data?.message || 'Unable to analyze the lab PDF.';
      yield { type: 'status', data: { status: 'responding', message: '✍️ Generating response...' } };
      yield { type: 'chunk', data: { text: analysis || fallback } };
      yield {
        type: 'complete',
        data: { status: 'complete', toolsUsed, iterations: 1 },
      };
      return;
    } while (false);

    if (fallbackToAgent) {
      cachedToolContextText = buildCachedToolContext(toolResultCache);
      // Continue to full agent loop for richer reasoning / alternative paths.
    } else {
      return;
    }
  }

  // Build system prompt
  // Build system prompt
  const systemPrompt = buildAgentSystemPrompt(format);

  // Initialize history with manual management
  const history: any[] = [
    ...buildCompactHistory(conversationHistory),
    ...(cachedToolContextText ? [{ role: 'user', parts: [{ text: cachedToolContextText }] }] : []),
    // Add current query
    { role: 'user', parts: [{ text: query }] },
  ];

  let iteration = 0;
  let finalResponse = '';
  const toolsUsed: ToolCallDetail[] = [];
  let lastResult: any = null;

  try {
    // Send initial query with streaming
    // We use generateContentStream with manual history
    let streamResult = await retryWithBackoff(
      () => ai.models.generateContentStream({
        model: selectedModel,
        contents: history,
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // @ts-ignore - Tool definitions type mismatch but compatible at runtime
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

    // Process initial stream
    let hasText = false;
    let hasFunctionCalls = false;
    const initialFunctionCallParts: any[] = [];
    let emittedInitialChunks = false;

    // Collect all chunks first to determine if we have function calls
    let capturedThoughtSignature: string | undefined;

    let initialChunkCount = 0;
    for await (const chunk of streamResult) {
      const receiveTime = Date.now();
      initialChunkCount++;

      // DEBUG: Inspect chunk structure
      const candidates = chunk.candidates || [];
      const parts = (candidates[0]?.content?.parts || []) as any[];
      const partWithSig = parts.find((p: any) => p.thoughtSignature || p.thought_signature);
      if (partWithSig) {
        const sigPart = partWithSig as any;
        capturedThoughtSignature = sigPart.thoughtSignature || sigPart.thought_signature;
      }

      if (parts.some((p: any) => p.functionCall)) {
        hasFunctionCalls = true;
        for (const part of parts) {
          if (part.functionCall) {
            const thoughtSignature = part.thoughtSignature || part.thought_signature || capturedThoughtSignature;
            const newPart: any = { ...part };
            if (thoughtSignature) {
              newPart.thoughtSignature = thoughtSignature;
              newPart.thought_signature = thoughtSignature;
            }
            initialFunctionCallParts.push(newPart);
          }
        }
        // Function call path: execute tools immediately instead of waiting for full stream completion
        break;
      }

      const chunkText = chunk.text;
      if (chunkText !== undefined) {
        console.log(`[StreamingAgent] Chunk #${initialChunkCount} received at ${receiveTime}, length: ${chunkText.length}`);
      }
      if (chunkText) {
        hasText = true;
        if (!emittedInitialChunks) {
          emittedInitialChunks = true;
          yield { type: 'status', data: { status: 'responding', message: '✍️ Generating response...' } };
        }

        // Yield chunk immediately and log when it was yielded
        const yieldTime = Date.now();
        console.log(`[StreamingAgent] Yielding chunk #${initialChunkCount} at ${yieldTime} (delta: ${yieldTime - receiveTime}ms)`);
        yield { type: 'chunk', data: { text: chunkText } };
        finalResponse += chunkText;
      }
    }
    console.log(`[StreamingAgent] Initial stream chunks received:`, initialChunkCount);

    if (hasFunctionCalls && initialFunctionCallParts.length > 0) {
      lastResult = {
        candidates: [{ content: { parts: initialFunctionCallParts } }],
      };
    } else {
      // Manual construction of lastResult since we consumed the stream
      lastResult = {
        candidates: [{
          content: {
            parts: [{ text: finalResponse }]
          }
        }]
      };
    }

    // If it's a final text response, stream completed
    if (hasText && !hasFunctionCalls) {
      // Send completion and exit
      yield {
        type: 'complete',
        data: {
          status: 'complete',
          toolsUsed: [],
          iterations: 1,
        },
      };
      return;
    }

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      if (iteration > 1) await sleep(200);

      if (iteration > 1) {
        yield { type: 'thinking', data: { iteration, message: '💭 Processing...' } };
      }

      // 1. Add Model Response to History (with thoughtSignature if present)
      // This is CRITICAL for Vertex AI function calling to work in next turn
      const candidates = lastResult.candidates;
      if (candidates && candidates.length > 0) {
        const modelContent = candidates[0].content;
        const modelParts = modelContent.parts || [];
        const signaturePart = modelParts.find((p: any) => p.thoughtSignature || p.thought_signature);
        const responseThoughtSignature =
          signaturePart?.thoughtSignature || signaturePart?.thought_signature || capturedThoughtSignature;

        const historyParts = modelParts.map((part: any) => {
          const newPart: any = { ...part };
          const partThoughtSignature = part.thoughtSignature || part.thought_signature || responseThoughtSignature;
          if (part.functionCall && partThoughtSignature) {
            // Include both camelCase and snake_case to be safe with SDK/API
            newPart.thoughtSignature = partThoughtSignature;
            newPart.thought_signature = partThoughtSignature;
          }
          return newPart;
        });

        // Debug: Log the model history part being added
        console.log(`[StreamingAgent] Adding model history part with signature:`,
          JSON.stringify(historyParts.map((p: any) => ({
            hasFunctionCall: !!p.functionCall,
            hasThoughtSignature: !!p.thoughtSignature,
            hasSnakeCaseSignature: !!p.thought_signature,
            signatureLength: (p.thoughtSignature || p.thought_signature)?.length
          }))));

        history.push({
          role: 'model',
          parts: historyParts
        });
      }

      // Check for function calls in the last result
      const functionCalls = extractFunctionCalls(lastResult, capturedThoughtSignature);
      capturedThoughtSignature = undefined;

      if (functionCalls && functionCalls.length > 0) {
        console.log(`[StreamingAgent] Iteration ${iteration}: Agent requesting ${functionCalls.length} tool(s)`);

        // Execute tools
        const functionResponses = [];

        for (const fc of functionCalls) {
          const toolName = fc.name;
          const args = fc.args || {};
          console.log(`[StreamingAgent] Calling tool: ${toolName}`);

          try {
            if (shouldNotifyToolUse(toolName) && !isToolCached(toolName, args)) {
              yield {
                type: 'tool',
                data: { tool: toolName, message: getToolMessage(toolName), args: args },
              };
            }

            const toolResult = await callToolCached(toolName, args);
            toolsUsed.push({ tool: toolName, name: toolName, args, result: toolResult });
            functionResponses.push({ name: toolName, response: toolResult }); // No thoughtSignature needed here
          } catch (toolError: any) {
            console.error(`[StreamingAgent] Tool ${toolName} failed:`, toolError);
            functionResponses.push({
              name: toolName,
              response: { error: toolError.message || 'Tool execution failed' }
            });
          }
        }

        const functionResponseParts = functionResponses.map((fr) => ({
          functionResponse: { name: fr.name, response: fr.response }
        }));

        // 2. Add Function Responses to History
        history.push({
          role: 'user',
          parts: functionResponseParts
        });

        // 3. Generate Next Response (non-streaming for tool usage loop usually better, but let's try stream)
        yield { type: 'status', data: { status: 'analyzing', message: '🔄 Processing results...' } };

        try {
          // Streaming API doesn't handle thoughtSignature correctly in requests sometimes, 
          // but since we are manually building history, it SHOULD work.

          streamResult = await retryWithBackoff(
            () => ai.models.generateContentStream({
              model: selectedModel,
              contents: history,
              // @ts-ignore
              config: {
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

          // Consume stream to check for text vs function calls
          hasText = false;
          hasFunctionCalls = false;
          const nextFunctionCallParts: any[] = [];
          let emittedToolResponseChunks = false;

          let toolChunkCount = 0;
          for await (const chunk of streamResult) {
            const receiveTime = Date.now();
            toolChunkCount++;
            // Check for signature in ANY part of ANY chunk
            const parts = (chunk.candidates?.[0]?.content?.parts || []) as any[];
            const partWithSig = parts.find((p: any) => p.thoughtSignature || p.thought_signature);
            if (partWithSig) {
              const sigPart = partWithSig as any;
              capturedThoughtSignature = sigPart.thoughtSignature || sigPart.thought_signature;
            }

            if (parts.some((p: any) => p.functionCall)) {
              hasFunctionCalls = true;
              for (const part of parts) {
                if (part.functionCall) {
                  const thoughtSignature = part.thoughtSignature || part.thought_signature || capturedThoughtSignature;
                  const newPart: any = { ...part };
                  if (thoughtSignature) {
                    newPart.thoughtSignature = thoughtSignature;
                    newPart.thought_signature = thoughtSignature;
                  }
                  nextFunctionCallParts.push(newPart);
                }
              }
              break;
            }

            const chunkText = chunk.text;
            if (chunkText !== undefined) {
              console.log(`[StreamingAgent] Tool response chunk #${toolChunkCount} received at ${receiveTime}, length: ${chunkText.length}`);
            }
            if (chunkText) {
              hasText = true;
              if (!emittedToolResponseChunks) {
                emittedToolResponseChunks = true;
                yield { type: 'status', data: { status: 'responding', message: '✍️ Generating response...' } };
              }
              const yieldTime = Date.now();
              console.log(`[StreamingAgent] Yielding tool response chunk #${toolChunkCount} at ${yieldTime} (delta: ${yieldTime - receiveTime}ms)`);
              yield { type: 'chunk', data: { text: chunkText } };
              finalResponse += chunkText;
            }
          }
          console.log(`[StreamingAgent] Tool response stream chunks received:`, toolChunkCount);

          if (hasFunctionCalls && nextFunctionCallParts.length > 0) {
            lastResult = {
              candidates: [{ content: { parts: nextFunctionCallParts } }],
            };
          } else {
            // Manual construction of lastResult
            lastResult = {
              candidates: [{ content: { parts: [{ text: finalResponse }] } }]
            };
          }

          // If we have text and no function calls, this is the final answer! Stream it!
          if (hasText && !hasFunctionCalls) {
            console.log(`[StreamingAgent] Final response received, streaming...`);
            break; // Done loop
          }

          console.log(`[StreamingAgent] Agent received tool responses, continuing to iteration ${iteration + 1}...`);
          continue;

        } catch (sendError: any) {
          console.error('[StreamingAgent] Error sending function responses:', sendError);
          throw sendError;
        }
      }

      // No more function calls, and we handled text/stream above.
      // If we fall through here without text and without function calls...
      if (!lastResult.candidates?.[0]?.content?.parts?.[0]?.text && (!functionCalls || functionCalls.length === 0)) {
        // Maybe just empty
        break;
      }
    }

    // Send completion event
    if (iteration >= MAX_ITERATIONS) {
      yield {
        type: 'error',
        data: { error: `Max iterations (${MAX_ITERATIONS}) reached. The AI may need more time.` },
      };
    } else {
      yield {
        type: 'complete',
        data: {
          status: 'complete',
          toolsUsed: toolsUsed.map((t) => t.name),
          iterations: iteration,
        },
      };
    }
  } catch (error: any) {
    console.error('[StreamingAgent] Unhandled error:', error);
    yield { type: 'error', data: { error: error.message || 'Agent loop failed' } };
  }
}

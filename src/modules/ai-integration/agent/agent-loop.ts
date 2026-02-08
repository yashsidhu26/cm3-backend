/**
 * Core Agent Loop Implementation
 * Orchestrates Gemini function calling with tool execution via Vertex AI
 */

import { VertexAI, FunctionCallingMode } from '@google-cloud/vertexai';
import type { ChatMessage, ResponseFormat } from '../types';
import type { AgentAIResponse, ToolCallDetail } from './types';
import { toolDefinitions } from './tool-definitions';
import { executeToolCall } from './tool-registry';
import { buildAgentSystemPrompt } from './system-prompt';

const MAX_ITERATIONS = 7;
const TOTAL_TIMEOUT_MS = 120000; // 120 seconds (2 minutes) - generous timeout

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
 * Extract function calls from Vertex AI response
 * Response structure varies by endpoint/model
 */
function extractFunctionCalls(result: any): any[] {
  // Try the method-based API first (older SDK versions)
  if (typeof result.response?.functionCalls === 'function') {
    return result.response.functionCalls();
  }

  // Parse from response structure (newer/different endpoints)
  const parts = result.response?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part: any) => part.functionCall)
    .map((part: any) => part.functionCall);
}

/**
 * Determine which model to use based on query complexity
 * - gemini-3-flash-preview: All queries (temporarily forced by user)
 *
 * TEMPORARY: User requested to force gemini-3-flash-preview for everything
 * and use regional endpoint (us-central1) instead of global
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

  // Select model first
  const selectedModel = selectModel(query, format);

  // TEMPORARY: Force global location with standard API endpoint
  const location = 'global';
  const apiEndpoint = 'aiplatform.googleapis.com';

  console.log(`[Agent] Model: ${selectedModel}, Location: ${location}, Endpoint: ${apiEndpoint}`);

  const vertexAI = new VertexAI({
    project: projectId,
    location,
    apiEndpoint
  });

  console.log(`[Agent] Using model: ${selectedModel}`);

  // Create model with tools
  const model = vertexAI.getGenerativeModel({
    model: selectedModel,
    tools: [{ functionDeclarations: toolDefinitions }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.AUTO,
      },
    },
  });

  // Build system prompt
  const systemPrompt = buildAgentSystemPrompt(format);

  // Build chat history for Gemini
  const history = [
    { role: 'user' as const, parts: [{ text: systemPrompt }] },
    {
      role: 'model' as const,
      parts: [
        {
          text: 'Understood. I will assist with student queries using the tools provided. I will not guess or make up information.',
        },
      ],
    },
    // Add previous conversation messages
    ...conversationHistory.map((msg) => ({
      role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
  ];

  // Start chat session
  const chat = model.startChat({ history });

  // Tracking
  const toolCallDetails: ToolCallDetail[] = [];
  const toolsUsed = new Set<string>();
  let iterations = 0;

  try {
    // Send user query
    let result = await chat.sendMessage(query);
    iterations++;

    // Agent loop
    while (iterations < MAX_ITERATIONS) {
      // Check total timeout
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn('[Agent] Total timeout exceeded, forcing final answer');
        break;
      }

      // Check if response has function calls
      const functionCalls = extractFunctionCalls(result);

      // Debug: Log response structure when no function calls
      if (!functionCalls || functionCalls.length === 0) {
        const parts = result.response?.candidates?.[0]?.content?.parts || [];
        console.log(`[Agent] Iteration ${iterations}: No function calls found`);
        console.log(`[Agent] Response parts:`, JSON.stringify(parts, null, 2));
      }

      if (!functionCalls || functionCalls.length === 0) {
        // Got final text response
        const finalText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (finalText) {
          console.log(`[Agent] Final answer received after ${iterations} iterations`);
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

        // No text and no function calls - unexpected
        throw new AgentError(
          'Gemini returned neither function calls nor text',
          'INVALID_RESPONSE',
          500
        );
      }

      // Execute all function calls in parallel
      console.log(`[Agent] Executing ${functionCalls.length} tool calls...`);
      const toolStartTime = Date.now();

      const toolResults = await Promise.allSettled(
        functionCalls.map((call: any) => {
          toolsUsed.add(call.name);
          return executeToolCall(call.name, call.args || {}, userId);
        })
      );

      // Build function response parts for Gemini
      const functionResponseParts = toolResults.map((result, index) => {
        const call = functionCalls[index];
        const toolDuration = Date.now() - toolStartTime;

        if (result.status === 'fulfilled') {
          const { name, response } = result.value;
          toolCallDetails.push({
            tool: name,
            durationMs: toolDuration,
            success: !response.error,
            error: response.error,
          });

          return {
            functionResponse: {
              name,
              response,
            },
          };
        } else {
          // Promise rejected
          toolCallDetails.push({
            tool: call.name,
            durationMs: toolDuration,
            success: false,
            error: result.reason?.message || 'Execution failed',
          });

          return {
            functionResponse: {
              name: call.name,
              response: {
                error: result.reason?.message || 'Tool execution failed',
              },
            },
          };
        }
      });

      // Send tool results back to Gemini
      result = await chat.sendMessage(functionResponseParts as any);
      iterations++;

      console.log(`[Agent] Iteration ${iterations} complete`);
    }

    // Max iterations reached - force a final answer
    if (iterations >= MAX_ITERATIONS) {
      console.warn('[Agent] Max iterations reached, forcing final answer');

      // Try to get text from last response
      try {
        const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return {
            response: text,
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
      } catch (e) {
        // No text available
      }

      // Send one final message disabling tools to force text response
      const finalModel = vertexAI.getGenerativeModel({
        model: selectedModel,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.NONE,
          },
        },
      });

      const finalChat = finalModel.startChat({ history });
      const finalResult = await finalChat.sendMessage(
        'Please provide your final answer based on the data collected so far. Do not make any more tool calls.'
      );

      const finalText = finalResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        response:
          finalText ||
          'I apologize, but I reached the maximum number of data requests. Please try rephrasing your question.',
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

    // Should not reach here
    throw new AgentError('Agent loop exited unexpectedly', 'UNEXPECTED_EXIT', 500);
  } catch (error: any) {
    console.error('[Agent] Error in agent loop:', error);

    if (error instanceof AgentError) {
      throw error;
    }

    throw new AgentError(
      `Agent execution failed: ${error.message}`,
      'AGENT_EXECUTION_FAILED',
      500
    );
  }
}

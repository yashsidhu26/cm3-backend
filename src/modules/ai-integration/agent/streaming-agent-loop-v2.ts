/**
 * Streaming Agent Loop V2 - Complete Rewrite
 * Based on updated @google/genai SDK
 */

import { GoogleGenAI } from '@google/genai';
import type { ChatMessage, ResponseFormat } from '../types';

export interface StreamEvent {
  type: 'status' | 'chunk' | 'complete' | 'error';
  data: any;
}

/**
 * Run streaming agent loop - simplified version following official SDK patterns
 */
export async function* runStreamingAgentLoopV2(
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

  try {
    yield { type: 'status', data: { message: 'Initializing...' } };

    // Initialize GoogleGenAI
    const ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: 'global',
    });

    const modelName = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
    console.log(`[StreamingV2] Using model: ${modelName}`);

    yield { type: 'status', data: { message: 'Generating response...' } };

    console.log(`[StreamingV2] Starting stream with query: "${query.substring(0, 50)}..."`);
    const streamStartTime = Date.now();

    // Generate content stream
    const streamingResult = await ai.models.generateContentStream({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: query }] }],
    });

    let chunkCount = 0;
    let fullText = '';

    // Iterate stream
    for await (const chunk of streamingResult) {
      const receiveTime = Date.now();
      chunkCount++;

      // Extract text from new SDK response format
      const chunkText = chunk.text;

      if (chunkText) {
        const elapsed = receiveTime - streamStartTime;
        console.log(`[StreamingV2] Chunk #${chunkCount} at +${elapsed}ms, length: ${chunkText.length}`);

        fullText += chunkText;

        // Yield chunk immediately
        yield {
          type: 'chunk',
          data: { text: chunkText },
        };
      }
    }

    const totalTime = Date.now() - streamStartTime;
    console.log(`[StreamingV2] Stream complete. Chunks: ${chunkCount}, Time: ${totalTime}ms`);

    yield {
      type: 'complete',
      data: {
        status: 'complete',
        chunkCount,
        totalTime,
      },
    };

  } catch (error: any) {
    console.error('[StreamingV2] Error:', error);
    yield {
      type: 'error',
      data: { error: error.message || 'Streaming failed' },
    };
  }
}

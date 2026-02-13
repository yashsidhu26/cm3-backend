/**
 * Test Streaming Route - EXACT copy of working test-vertex-streaming.ts
 * This should work identically since it's the exact same code
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { VertexAI } from '@google-cloud/vertexai';

const app = new Hono();

/**
 * POST /test-stream
 * EXACT copy of working test implementation
 */
app.post('/test-stream', async (c) => {
  console.log('[TestRoute] Starting test stream (exact copy of working test)');

  return streamSSE(c, async (stream) => {
    try {
      const projectId = process.env.GCP_PROJECT_ID || 'vivid-spot-311815';

      if (!projectId) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'GCP_PROJECT_ID not set' }),
        });
        return;
      }

      // EXACT initialization from working test
      const vertexAI = new VertexAI({
        project: projectId,
        location: 'global',
      });

      const modelName = 'gemini-3-flash-preview';
      console.log('[TestRoute] Using model:', modelName);

      const model = vertexAI.getGenerativeModel({
        model: modelName,
      });

      console.log('[TestRoute] Calling Vertex AI generateContentStream...');
      const startTime = Date.now();

      // EXACT streaming call from working test
      let streamResult;
      try {
        streamResult = await model.generateContentStream(
          'Write a short story about a robot learning to paint. Make it about 200 words.'
        );
      } catch (apiError: any) {
        console.error('[TestRoute] Vertex AI API Error:', apiError.message);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: 'Vertex AI API call failed',
            message: apiError.message,
          }),
        });
        return;
      }

      let chunkIndex = 0;
      console.log('[TestRoute] Starting to consume stream...');

      // EXACT stream consumption from working test
      for await (const chunk of streamResult.stream) {
        const receiveTime = Date.now();
        chunkIndex++;

        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;

        if (chunkText) {
          const elapsed = receiveTime - startTime;
          console.log(`[TestRoute] Chunk #${chunkIndex} received at +${elapsed}ms, length: ${chunkText.length}`);

          const payload = {
            text: chunkText,
            chunkIndex,
            timestamp: receiveTime,
          };

          const jsonData = JSON.stringify(payload);

          await stream.writeSSE({
            event: 'chunk',
            data: jsonData,
          });

          console.log(`[TestRoute] Chunk #${chunkIndex} sent to client`);
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`[TestRoute] Stream complete. Total chunks: ${chunkIndex}, Total time: ${totalTime}ms`);

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          totalChunks: chunkIndex,
          totalTime,
        }),
      });

    } catch (error: any) {
      console.error('[TestRoute] Error:', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error.message }),
      });
    }
  });
});

export default app;

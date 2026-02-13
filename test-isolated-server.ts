#!/usr/bin/env bun

/**
 * Isolated Streaming Server
 * Runs the full AI agent with tools on port 4444
 * ZERO middleware except CORS and auth - completely clean Hono app
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { runStreamingAgentLoop } from './src/modules/ai-integration/agent/streaming-agent-loop';
import { runAgentLoop } from './src/modules/ai-integration/agent/agent-loop';
import { aiIntegrationService } from './src/modules/ai-integration/ai-integration.service';
import { SessionService } from './src/core/auth/session';

const app = new Hono();

// CORS - Allow requests from frontend
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080',
    process.env.FRONTEND_URL,
  ].filter((url): url is string => !!url),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Cookie', 'Authorization'],
}));

app.post('/stream', async (c) => {
  console.log('[Isolated] Starting AI agent stream');

  // Authenticate using the same method as the main app
  const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
  const token = await getSignedCookie(c, secret, 'super-app.session_token');

  if (!token) {
    console.error('[Isolated] No session token found');
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Unauthorized - no session token' }),
      });
    });
  }

  console.log('[Isolated] Session token found:', token.substring(0, 20) + '...');

  const sessionData = await SessionService.validateSession(token);

  if (!sessionData || !sessionData.user) {
    console.error('[Isolated] Invalid session');
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Unauthorized - invalid session' }),
      });
    });
  }

  const userId = sessionData.user.id;
  console.log('[Isolated] Authenticated user:', userId, sessionData.user.email);

  // Get request data
  let query = 'Write a short story about a robot learning to paint. Make it about 200 words.';
  let format: any = undefined;
  let conversationHistory: any[] = [];
  let includeHistory = true;

  try {
    const body = await c.req.json();
    if (body.query) query = body.query;
    if (body.format) format = body.format;
    if (typeof body.includeHistory === 'boolean') includeHistory = body.includeHistory;
    if (body.conversationHistory) conversationHistory = body.conversationHistory;

    console.log('[Isolated] Query:', query.substring(0, 50) + '...');
    console.log('[Isolated] Format:', format);
    console.log('[Isolated] Include history:', includeHistory);
  } catch (e) {
    console.error('[Isolated] Failed to parse request body:', e);
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: 'Invalid request body' }),
      });
    });
  }

  // Load recent history if not provided by client
  if (includeHistory && conversationHistory.length === 0) {
    try {
      conversationHistory = await aiIntegrationService.getConversationHistory(userId, 5);
      console.log('[Isolated] Loaded recent history:', conversationHistory.length);
    } catch (error: any) {
      console.warn('[Isolated] Failed to load history:', error?.message || error);
    }
  }

  return streamSSE(c, async (stream) => {
    let fullResponse = '';
    let toolsUsed: string[] = [];
    let iterations = 0;

    try {
      const startTime = Date.now();
      let chunkIndex = 0;

      // Run the full agent loop with streaming
      for await (const event of runStreamingAgentLoop(userId, query, conversationHistory, format)) {
        const elapsed = Date.now() - startTime;

        // Forward all events to client
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        });

        // Log event
        if (event.type === 'chunk') {
          chunkIndex++;
          console.log(`[Isolated] Chunk #${chunkIndex} at +${elapsed}ms, length: ${event.data?.text?.length}`);
          fullResponse += event.data.text;
        } else {
          console.log(`[Isolated] Event: ${event.type} at +${elapsed}ms`);
        }

        // Track metadata
        if (event.type === 'tool' && event.data?.tool) {
          if (!toolsUsed.includes(event.data.tool)) {
            toolsUsed.push(event.data.tool);
          }
        }

        if (event.type === 'complete') {
          iterations = event.data?.iterations || 1;
          toolsUsed = event.data?.toolsUsed || toolsUsed;
        }

        // Break on error or complete
        if (event.type === 'error' || event.type === 'complete') {
          break;
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`[Isolated] Stream complete. Time: ${totalTime}ms, Chunks: ${chunkIndex}`);

      // Save conversation history
      if (fullResponse && userId) {
        try {
          await aiIntegrationService.saveConversation(userId, {
            role: 'user',
            content: query,
            timestamp: new Date(),
          });

          await aiIntegrationService.saveAIResponse(
            userId,
            {
              role: 'assistant',
              content: fullResponse,
              timestamp: new Date(),
            },
            'gemini',
            'streaming',
            [],
            toolsUsed,
            iterations,
            toolsUsed.length
          );
        } catch (saveError: any) {
          console.error('[Isolated] Error saving conversation:', saveError);
        }
      }

    } catch (error: any) {
      console.error('[Isolated] Error:', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error.message }),
      });
    }
  });
});

// Simple test endpoint (no auth) for the test page
app.post('/test-stream', async (c) => {
  console.log('[Isolated] Simple test stream (no auth)');

  return streamSSE(c, async (stream) => {
    try {
      const { GoogleGenAI } = await import('@google/genai');

      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GCP_PROJECT_ID || 'vivid-spot-311815',
        location: 'global',
      });

      const startTime = Date.now();
      const streamResult = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Write a short story about a robot learning to paint. About 200 words.' }]
          }
        ],
      });

      let chunkIndex = 0;
      for await (const chunk of streamResult) {
        const receiveTime = Date.now();
        chunkIndex++;
        const chunkText = chunk.text;

        if (chunkText) {
          const elapsed = receiveTime - startTime;
          console.log(`[Isolated] Test chunk #${chunkIndex} at +${elapsed}ms`);

          await stream.writeSSE({
            event: 'chunk',
            data: JSON.stringify({ text: chunkText, chunkIndex }),
          });
        }
      }

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ totalChunks: chunkIndex }),
      });

    } catch (error: any) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error.message }),
      });
    }
  });
});

// Full Agent Test Endpoint (Non-streaming)
app.post('/test-agent', async (c) => {
  console.log('[Isolated] Testing full agent loop (non-streaming)');
  const startTime = Date.now();

  try {
    const result = await runAgentLoop(
      'test-user-id',
      'What is the weather in London? (Tool test)',
      [],
    );

    const elapsed = Date.now() - startTime;
    console.log(`[Isolated] Agent finished in ${elapsed}ms`);
    console.log('[Isolated] Result:', result);

    return c.json({
      success: true,
      elapsed,
      result
    });

  } catch (error: any) {
    console.error('[Isolated] Agent error:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// Simple HTML page for testing
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <title>Isolated Server Test</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
    button { padding: 10px 20px; background: #0e639c; color: white; border: none; cursor: pointer; }
    #output { margin-top: 20px; padding: 10px; border: 1px solid #555; background: #252526; }
    .chunk { margin: 5px 0; padding: 5px; background: #2d2d30; }
  </style>
</head>
<body>
  <h1>🧪 Isolated Server Test (Port 4444)</h1>
  <p>This server has ZERO middleware - completely clean Hono app</p>
  <p>This server has ZERO middleware - completely clean Hono app</p>
  <button onclick="test()">Test Streaming (V2)</button>
  <button onclick="testAgent()">Test Full Agent (Tools)</button>
  <div id="output"></div>
  <div id="agent-output" style="margin-top: 20px; border-top: 1px solid #555; padding-top: 10px;"></div>

  <script>
    async function testAgent() {
        const output = document.getElementById('agent-output');
        output.innerHTML = '<p>Running full agent...</p>';
        try {
            const res = await fetch('/test-agent', { method: 'POST' });
            const data = await res.json();
            output.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        } catch (e) {
            output.innerHTML = '<p style="color:red">Error: ' + e.message + '</p>';
        }
    }

    const timestamps = [];
    async function test() {
      const output = document.getElementById('output');
      output.innerHTML = '<p>Connecting...</p>';
      const startTime = Date.now();

      const response = await fetch('/test-stream', { method: 'POST' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event:')) currentEvent = line.substring(6).trim();
          else if (line.startsWith('data:')) {
            const data = JSON.parse(line.substring(5).trim());
            const now = Date.now();

            if (currentEvent === 'chunk') {
              timestamps.push(now);
              const elapsed = now - startTime;
              output.innerHTML += \`<div class="chunk">[+\${elapsed}ms] Chunk #\${data.chunkIndex}: \${data.text.substring(0, 50)}...</div>\`;
            } else if (currentEvent === 'complete') {
              const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
              const maxInterval = Math.max(...intervals);
              const result = maxInterval > 50 ? '✅ REAL-TIME' : '❌ BUFFERED';
              output.innerHTML += \`<div style="margin-top:20px; font-weight:bold;">\${result} (max interval: \${maxInterval}ms)</div>\`;
            }
          }
        }
      }
    }
  </script>
</body>
</html>
  `);
});

console.log('🎯 Isolated Streaming Server');
console.log('');
console.log('📡 Production endpoint (authenticated):');
console.log('   POST http://localhost:4444/stream');
console.log('   Requires session cookie from Better Auth');
console.log('');
console.log('🧪 Test endpoint (no auth):');
console.log('   POST http://localhost:4444/test-stream');
console.log('   GET  http://localhost:4444/ (test page)');
console.log('');

export default {
  port: 4444,
  fetch: app.fetch,
  idleTimeout: 120, // 120 seconds (2 minutes) for long streaming requests
};

#!/usr/bin/env bun

/**
 * Standalone Vertex AI Streaming Test
 * Tests if Vertex AI actually streams in real-time or delivers chunks all at once
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { VertexAI } from '@google-cloud/vertexai';
import { cors } from 'hono/cors';

// Set up credentials explicitly
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'keys.json';
const fullCredPath = credPath.startsWith('/') ? credPath : `${process.cwd()}/${credPath}`;
process.env.GOOGLE_APPLICATION_CREDENTIALS = fullCredPath;

console.log('🔑 Using credentials:', fullCredPath);

const app = new Hono();

// Enable CORS
app.use('*', cors());

// Serve test HTML page
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <title>Vertex AI Streaming Test</title>
  <style>
    body {
      font-family: monospace;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
    }
    #output {
      border: 1px solid #ccc;
      padding: 10px;
      min-height: 200px;
      background: #f5f5f5;
      white-space: pre-wrap;
    }
    .timestamp {
      color: #666;
      font-size: 0.9em;
    }
    button {
      padding: 10px 20px;
      font-size: 16px;
      cursor: pointer;
    }
    .chunk {
      margin: 5px 0;
      padding: 5px;
      background: white;
      border-left: 3px solid #4CAF50;
    }
  </style>
</head>
<body>
  <h1>🧪 Vertex AI Streaming Test</h1>
  <p>This tests if Vertex AI streams in real-time or delivers chunks all at once.</p>

  <button onclick="testStreaming()">Start Streaming Test</button>
  <button onclick="clearOutput()">Clear</button>

  <h2>Output:</h2>
  <div id="output"></div>

  <h2>Analysis:</h2>
  <div id="analysis"></div>

  <script>
    const output = document.getElementById('output');
    const analysis = document.getElementById('analysis');
    const timestamps = [];

    function clearOutput() {
      output.innerHTML = '';
      analysis.innerHTML = '';
      timestamps.length = 0;
    }

    function formatTime(ms) {
      return new Date(ms).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    }

    async function testStreaming() {
      clearOutput();
      output.innerHTML = '<div class="timestamp">⏳ Connecting to stream...</div>';

      const startTime = Date.now();
      const eventSource = new EventSource('/stream');
      let chunkCount = 0;
      let firstChunkTime = null;

      eventSource.addEventListener('chunk', (e) => {
        const now = Date.now();
        const elapsed = now - startTime;
        chunkCount++;

        if (!firstChunkTime) firstChunkTime = now;

        console.log('Received chunk event, raw data:', e.data);

        let data;
        try {
          data = JSON.parse(e.data);
        } catch (err) {
          console.error('Failed to parse chunk data:', e.data, err);
          output.innerHTML += \`<div style="color: red;">Parse error: \${err.message}<br>Raw: \${e.data.substring(0, 100)}</div>\`;
          return;
        }

        timestamps.push(now);

        const text = data.text || '';
        const preview = text.substring(0, 50).replace(/\\n/g, '\\\\n');

        const div = document.createElement('div');
        div.className = 'chunk';
        div.innerHTML = \`
          <span class="timestamp">[+\${elapsed}ms]</span>
          Chunk #\${chunkCount}: "\${preview}\${text.length > 50 ? '...' : ''}"
          <small>(len: \${text.length})</small>
        \`;
        output.appendChild(div);
      });

      eventSource.addEventListener('complete', () => {
        eventSource.close();

        const totalTime = Date.now() - startTime;

        // Analyze timestamps
        let analyzeHTML = '<h3>Results:</h3>';
        analyzeHTML += \`<p>📊 Total chunks: <strong>\${chunkCount}</strong></p>\`;
        analyzeHTML += \`<p>⏱️ Total time: <strong>\${totalTime}ms</strong></p>\`;

        if (chunkCount > 1) {
          // Calculate intervals between chunks
          const intervals = [];
          for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i-1]);
          }

          const minInterval = Math.min(...intervals);
          const maxInterval = Math.max(...intervals);
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

          analyzeHTML += \`<p>📈 Chunk intervals:</p>\`;
          analyzeHTML += \`<ul>\`;
          analyzeHTML += \`<li>Min: <strong>\${minInterval}ms</strong></li>\`;
          analyzeHTML += \`<li>Max: <strong>\${maxInterval}ms</strong></li>\`;
          analyzeHTML += \`<li>Avg: <strong>\${avgInterval.toFixed(1)}ms</strong></li>\`;
          analyzeHTML += \`</ul>\`;

          // Determine if it's real streaming
          const allAtOnce = maxInterval < 10; // All chunks within 10ms

          if (allAtOnce) {
            analyzeHTML += \`<p>❌ <strong>NOT REAL-TIME STREAMING</strong></p>\`;
            analyzeHTML += \`<p>All chunks arrived within \${maxInterval}ms - they were buffered!</p>\`;
          } else {
            analyzeHTML += \`<p>✅ <strong>REAL-TIME STREAMING CONFIRMED</strong></p>\`;
            analyzeHTML += \`<p>Chunks arrived over \${totalTime}ms with natural intervals.</p>\`;
          }
        }

        analysis.innerHTML = analyzeHTML;
      });

      eventSource.onerror = (err) => {
        eventSource.close();
        output.innerHTML += '<div style="color: red;">❌ Error: Connection failed</div>';
        console.error(err);
      };
    }
  </script>
</body>
</html>
  `);
});

// SSE streaming endpoint
app.get('/stream', (c) => {
  console.log('[Test] Starting stream...');

  return streamSSE(c, async (stream) => {
    try {
      const projectId = process.env.GCP_PROJECT_ID;
      if (!projectId) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: 'GCP_PROJECT_ID not set' }),
        });
        return;
      }

      // Initialize Vertex AI
      const vertexAI = new VertexAI({
        project: projectId,
        location: 'global',
      });

      // Use gemini-1.5-flash which is definitely available
      const modelName = 'gemini-3-flash-preview';
      console.log('[Test] Using model:', modelName);

      const model = vertexAI.getGenerativeModel({
        model: modelName,
      });

      console.log('[Test] Calling Vertex AI generateContentStream...');
      console.log('[Test] Using model: gemini-3-flash-preview');
      console.log('[Test] Project:', projectId);
      console.log('[Test] Location: global');

      const startTime = Date.now();

      // Stream from Vertex AI
      let streamResult;
      try {
        streamResult = await model.generateContentStream(
          'What is a utopian society?'
        );
      } catch (apiError: any) {
        console.error('[Test] Vertex AI API Error:', apiError.message);
        console.error('[Test] Error details:', apiError);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            error: 'Vertex AI API call failed',
            message: apiError.message,
            details: apiError.toString()
          }),
        });
        return;
      }

      let chunkIndex = 0;
      console.log('[Test] Starting to consume stream...');

      for await (const chunk of streamResult.stream) {
        const receiveTime = Date.now();
        chunkIndex++;

        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;

        if (chunkText) {
          const elapsed = receiveTime - startTime;
          console.log(`[Test] Chunk #${chunkIndex} received at +${elapsed}ms, length: ${chunkText.length}`);

          // Send to frontend - ensure proper JSON encoding
          const payload = {
            text: chunkText,
            chunkIndex,
            timestamp: receiveTime,
          };

          const jsonData = JSON.stringify(payload);
          console.log(`[Test] Sending JSON (first 100 chars): ${jsonData.substring(0, 100)}`);

          await stream.writeSSE({
            event: 'chunk',
            data: jsonData,
          });

          console.log(`[Test] Chunk #${chunkIndex} sent to client`);
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`[Test] Stream complete. Total chunks: ${chunkIndex}, Total time: ${totalTime}ms`);

      // Send completion event
      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          totalChunks: chunkIndex,
          totalTime,
        }),
      });

    } catch (error: any) {
      console.error('[Test] Error:', error);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error.message }),
      });
    }
  });
});

// Start server
const port = 3333;
console.log(`🧪 Vertex AI Streaming Test Server`);
console.log(`   http://localhost:${port}`);
console.log('');
console.log('Open the URL in your browser to test streaming');

export default {
  port,
  fetch: app.fetch,
};

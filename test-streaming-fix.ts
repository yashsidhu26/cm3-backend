#!/usr/bin/env bun

/**
 * Test script to verify SSE streaming works correctly
 * Measures timestamps to ensure chunks arrive incrementally, not all at once
 */

const SESSION_TOKEN = process.env.SESSION_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

if (!SESSION_TOKEN) {
  console.error('❌ SESSION_TOKEN environment variable required');
  console.error('   Get your token from browser DevTools → Application → Cookies');
  console.error('   Then run: SESSION_TOKEN=your-token bun test-streaming-fix.ts');
  process.exit(1);
}

async function testStreaming() {
  console.log('🧪 Testing SSE Streaming...\n');
  console.log(`📡 Connecting to: ${BACKEND_URL}/api/ai-integration/chat-stream\n`);

  const startTime = Date.now();
  const timestamps: { event: string; elapsed: number; data?: any }[] = [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cookie': `super-app.session_token=${SESSION_TOKEN}`,
      },
      body: JSON.stringify({
        query: 'What is a utopian society?',
        format: 'text',
      }),
    });

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      process.exit(1);
    }

    if (!response.body) {
      console.error('❌ No response body');
      process.exit(1);
    }

    console.log('✅ Stream connected\n');
    console.log('📊 Receiving events:\n');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;
    let firstChunkTime: number | null = null;
    let lastChunkTime: number | null = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log('\n✅ Stream completed');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          const eventType = line.substring(6).trim();
          const elapsed = Date.now() - startTime;

          // Next line should be data
          continue;
        }

        if (line.startsWith('data:')) {
          const dataStr = line.substring(5).trim();
          const elapsed = Date.now() - startTime;

          try {
            const data = JSON.parse(dataStr);
            const eventType = timestamps[timestamps.length - 1]?.event || 'unknown';

            timestamps.push({ event: eventType, elapsed, data });

            // Format output
            const elapsedSec = (elapsed / 1000).toFixed(3);
            const eventEmoji = {
              status: '📝',
              tool: '🔧',
              thinking: '💭',
              chunk: '📄',
              complete: '✅',
              error: '❌',
            }[eventType] || '📌';

            if (eventType === 'chunk') {
              chunkCount++;
              if (firstChunkTime === null) {
                firstChunkTime = elapsed;
              }
              lastChunkTime = elapsed;

              const text = data.text || '';
              const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
              console.log(`[${elapsedSec}s] ${eventEmoji} ${eventType}: "${preview}"`);
            } else if (eventType === 'tool') {
              console.log(`[${elapsedSec}s] ${eventEmoji} ${eventType}: ${data.tool} - ${data.message}`);
            } else if (eventType === 'status') {
              console.log(`[${elapsedSec}s] ${eventEmoji} ${eventType}: ${data.message}`);
            } else {
              console.log(`[${elapsedSec}s] ${eventEmoji} ${eventType}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Handle event: lines that come before data:
        if (line.trim() && !line.startsWith('data:') && !line.startsWith('event:')) {
          // Empty line or other SSE field
        }
      }
    }

    // Analysis
    console.log('\n📊 Streaming Analysis:\n');
    console.log(`   Total events: ${timestamps.length}`);
    console.log(`   Chunk events: ${chunkCount}`);
    console.log(`   Total time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

    if (chunkCount > 1 && firstChunkTime !== null && lastChunkTime !== null) {
      const streamingDuration = lastChunkTime - firstChunkTime;
      const avgInterval = streamingDuration / (chunkCount - 1);

      console.log(`   First chunk at: ${(firstChunkTime / 1000).toFixed(3)}s`);
      console.log(`   Last chunk at: ${(lastChunkTime / 1000).toFixed(3)}s`);
      console.log(`   Streaming duration: ${(streamingDuration / 1000).toFixed(3)}s`);
      console.log(`   Avg chunk interval: ${avgInterval.toFixed(0)}ms`);

      // Check if streaming is real or fake
      if (streamingDuration < 100) {
        console.log('\n⚠️  WARNING: All chunks arrived within 100ms');
        console.log('   This suggests buffered/fake streaming, not real-time streaming');
      } else if (avgInterval < 10) {
        console.log('\n⚠️  WARNING: Very fast chunk intervals (<10ms)');
        console.log('   This might indicate buffered streaming');
      } else {
        console.log('\n✅ Real-time streaming confirmed!');
        console.log('   Chunks arrived incrementally over time');
      }
    }

    // Show timestamp distribution
    if (chunkCount > 2) {
      console.log('\n📈 Timestamp Distribution:');
      const chunkTimestamps = timestamps
        .filter(t => t.event === 'chunk')
        .map(t => t.elapsed);

      for (let i = 0; i < Math.min(5, chunkTimestamps.length); i++) {
        console.log(`   Chunk ${i + 1}: ${chunkTimestamps[i]}ms`);
      }
      if (chunkTimestamps.length > 5) {
        console.log(`   ... (${chunkTimestamps.length - 5} more)`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testStreaming();

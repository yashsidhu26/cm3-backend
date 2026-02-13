#!/usr/bin/env bun

/**
 * Test the isolated streaming server with authentication
 * Tests POST http://localhost:4444/stream
 */

console.log('🧪 Testing Isolated Streaming Server with Auth\n');

// Use existing session cookie
const sessionCookie = 'super-app.session_token=Sp93jLZSjmeEvbqW67XsqEm-w08-7MRlBPYNkpjjweI.WvNB2ldgA9T9QT6pygJ5lZ6oqXNVQSTqeZbrn%2B2f%2B4k%3D';

console.log('1️⃣ Using session cookie:');
console.log('   Cookie:', sessionCookie.substring(0, 50) + '...\n');

// Test the streaming endpoint
console.log('2️⃣ Testing streaming endpoint...');

const testQuery = 'Write a short haiku about programming. Keep it brief.';
console.log('   Query:', testQuery);
console.log('   URL: http://localhost:4444/stream\n');

const streamResponse = await fetch('http://localhost:4444/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': sessionCookie,
  },
  body: JSON.stringify({
    query: testQuery,
    format: 'text',
  }),
});

if (!streamResponse.ok) {
  console.error('❌ Streaming request failed:', streamResponse.status, streamResponse.statusText);
  const error = await streamResponse.text();
  console.error('Error:', error);
  process.exit(1);
}

if (!streamResponse.body) {
  console.error('❌ No response body');
  process.exit(1);
}

console.log('✅ Connected to stream\n');
console.log('📡 Receiving events:\n');
console.log('─'.repeat(60));

// Step 3: Read the SSE stream
const reader = streamResponse.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

const timestamps: number[] = [];
let chunkCount = 0;
let fullText = '';
const startTime = Date.now();

try {
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      console.log('─'.repeat(60));
      console.log('\n✅ Stream complete');
      break;
    }

    // Decode chunk
    buffer += decoder.decode(value, { stream: true });

    // Split by newlines to get individual SSE messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        const dataStr = line.substring(5).trim();
        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);
          const now = Date.now();
          const elapsed = now - startTime;

          if (currentEvent === 'status') {
            console.log(`[${elapsed}ms] 📊 ${data.message || data.status}`);
          } else if (currentEvent === 'tool') {
            console.log(`[${elapsed}ms] 🔧 Tool: ${data.tool} ${data.message || ''}`);
          } else if (currentEvent === 'thinking') {
            console.log(`[${elapsed}ms] 💭 ${data.message || 'Processing...'}`);
          } else if (currentEvent === 'chunk') {
            chunkCount++;
            timestamps.push(now);
            const preview = data.text.substring(0, 50).replace(/\n/g, ' ');
            console.log(`[${elapsed}ms] 📝 Chunk #${chunkCount}: ${preview}${data.text.length > 50 ? '...' : ''}`);
            fullText += data.text;
          } else if (currentEvent === 'complete') {
            console.log(`[${elapsed}ms] ✅ Complete - Iterations: ${data.iterations}, Tools: ${data.toolsUsed?.length || 0}`);
          } else if (currentEvent === 'error') {
            console.log(`[${elapsed}ms] ❌ Error: ${data.error}`);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  // Step 4: Analyze results
  console.log('\n📊 Analysis:\n');
  console.log('─'.repeat(60));

  const totalTime = Date.now() - startTime;
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(`📦 Chunks received: ${chunkCount}`);
  console.log(`📏 Total text length: ${fullText.length} characters`);

  if (timestamps.length > 1) {
    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const maxInterval = Math.max(...intervals);
    const minInterval = Math.min(...intervals);

    console.log(`\n⏱️  Chunk intervals:`);
    console.log(`   Average: ${avgInterval.toFixed(0)}ms`);
    console.log(`   Min: ${minInterval}ms`);
    console.log(`   Max: ${maxInterval}ms`);

    // Determine if streaming is real-time or buffered
    if (maxInterval > 50) {
      console.log(`\n✅ REAL-TIME STREAMING! Chunks arrived incrementally.`);
    } else {
      console.log(`\n❌ BUFFERED! All chunks arrived within ${maxInterval}ms.`);
    }
  }

  console.log('\n📄 Response preview:');
  console.log('─'.repeat(60));
  console.log(fullText.substring(0, 200) + (fullText.length > 200 ? '...' : ''));
  console.log('─'.repeat(60));

} catch (error: any) {
  console.error('\n❌ Stream error:', error.message);
  process.exit(1);
}

console.log('\n✅ Test complete!\n');

/**
 * Manual Streaming Test
 * Run with: bun test-streaming-manual.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testStreaming() {
  console.log('🧪 Testing Streaming Endpoint\n');
  console.log('Base URL:', BASE_URL);
  console.log('━'.repeat(50));

  // Test 1: Without authentication (should fail)
  console.log('\n📝 Test 1: Without authentication');
  console.log('Expected: 401 Unauthorized');

  try {
    const res1 = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        query: 'What is 2+2?',
        format: 'text',
      }),
    });

    console.log(`Status: ${res1.status}`);
    if (res1.status === 401) {
      console.log('✅ PASS - Correctly requires authentication\n');
    } else {
      console.log('❌ FAIL - Should return 401\n');
      const text = await res1.text();
      console.log('Response:', text);
    }
  } catch (error: any) {
    console.log('❌ FAIL - Error:', error.message);
  }

  // Test 2: With authentication (requires manual session token)
  const sessionToken = process.env.SESSION_TOKEN;

  if (!sessionToken) {
    console.log('\n⚠️ Test 2: Skipped (no SESSION_TOKEN env var)');
    console.log('To test with auth, run:');
    console.log('SESSION_TOKEN=your-token bun test-streaming-manual.ts\n');
    return;
  }

  console.log('\n📝 Test 2: With authentication');
  console.log('Expected: 200 OK with SSE stream');

  try {
    const res2 = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cookie': `super-app.session_token=${sessionToken}`,
      },
      body: JSON.stringify({
        query: 'What is 2+2?',
        format: 'text',
      }),
    });

    console.log(`Status: ${res2.status}`);
    console.log(`Content-Type: ${res2.headers.get('content-type')}`);

    if (res2.status !== 200) {
      console.log('❌ FAIL - Expected 200 OK');
      const text = await res2.text();
      console.log('Response:', text);
      return;
    }

    if (res2.headers.get('content-type') !== 'text/event-stream') {
      console.log('❌ FAIL - Expected text/event-stream');
      return;
    }

    console.log('✅ Response headers correct');
    console.log('\n📡 Reading SSE stream...\n');

    // Read stream
    const reader = res2.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: Array<{ type: string; data: any }> = [];
    let startTime = Date.now();
    let timeout = false;

    // Set timeout
    const timeoutId = setTimeout(() => {
      timeout = true;
      reader.cancel();
    }, 30000); // 30 seconds

    try {
      while (!timeout) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split('\n');
          let eventType = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.substring(5).trim();
            }
          }

          if (data) {
            try {
              const parsedData = JSON.parse(data);
              events.push({ type: eventType, data: parsedData });

              // Print event
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              console.log(`[${elapsed}s] ${eventType}:`,
                eventType === 'chunk'
                  ? parsedData.text
                  : parsedData.message || parsedData.status || JSON.stringify(parsedData)
              );

              // Stop when complete or error
              if (eventType === 'complete' || eventType === 'error') {
                clearTimeout(timeoutId);
                reader.cancel();
                break;
              }
            } catch (e) {
              console.error('Failed to parse:', data);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n━'.repeat(50));
    console.log(`\n⏱️  Total time: ${totalTime}s`);
    console.log(`📊 Total events: ${events.length}`);

    // Analyze events
    const statusEvents = events.filter(e => e.type === 'status');
    const toolEvents = events.filter(e => e.type === 'tool');
    const thinkingEvents = events.filter(e => e.type === 'thinking');
    const chunkEvents = events.filter(e => e.type === 'chunk');
    const completeEvents = events.filter(e => e.type === 'complete');
    const errorEvents = events.filter(e => e.type === 'error');

    console.log('\n📈 Event Breakdown:');
    console.log(`  - Status: ${statusEvents.length}`);
    console.log(`  - Tool: ${toolEvents.length}`);
    console.log(`  - Thinking: ${thinkingEvents.length}`);
    console.log(`  - Chunk: ${chunkEvents.length}`);
    console.log(`  - Complete: ${completeEvents.length}`);
    console.log(`  - Error: ${errorEvents.length}`);

    // Verify expected events
    console.log('\n🔍 Verification:');

    if (statusEvents.length > 0) {
      console.log('✅ Received status events');
    } else {
      console.log('❌ No status events');
    }

    if (chunkEvents.length > 0) {
      console.log('✅ Received response chunks');
      const fullResponse = chunkEvents.map(e => e.data.text).join('');
      console.log(`   Response length: ${fullResponse.length} chars`);
    } else {
      console.log('❌ No response chunks');
    }

    if (completeEvents.length > 0) {
      console.log('✅ Stream completed successfully');
      if (completeEvents[0].data.toolsUsed) {
        console.log(`   Tools used: ${completeEvents[0].data.toolsUsed.join(', ') || 'none'}`);
      }
    } else if (errorEvents.length > 0) {
      console.log('❌ Stream ended with error');
      console.log(`   Error: ${errorEvents[0].data.error}`);
    } else {
      console.log('⚠️  Stream ended without complete/error event');
    }

    console.log('\n━'.repeat(50));

    // Overall result
    const hasStatus = statusEvents.length > 0;
    const hasChunks = chunkEvents.length > 0;
    const hasComplete = completeEvents.length > 0;
    const hasError = errorEvents.length > 0;

    if (hasStatus && hasChunks && hasComplete && !hasError) {
      console.log('\n🎉 ALL TESTS PASSED!\n');
    } else if (hasError) {
      console.log('\n❌ TESTS FAILED - Stream ended with error\n');
    } else {
      console.log('\n⚠️  TESTS INCOMPLETE - Some expected events missing\n');
    }

  } catch (error: any) {
    console.log('❌ FAIL - Error:', error.message);
    console.error(error);
  }
}

// Run tests
testStreaming().catch(console.error);

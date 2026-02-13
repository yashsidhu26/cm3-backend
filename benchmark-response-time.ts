/**
 * Response Time Benchmark Script
 * Measures current performance and estimates savings with cachedContent optimization
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SESSION_TOKEN = process.env.SESSION_TOKEN;

interface TimingResult {
  query: string;
  requestSize: number;
  responseSize: number;
  uploadTime: number;
  processingTime: number;
  downloadTime: number;
  totalTime: number;
  firstChunkTime: number;
  chunkCount: number;
}

/**
 * Measure detailed timing for a streaming request
 */
async function measureStreamingRequest(query: string): Promise<TimingResult> {
  const requestBody = JSON.stringify({
    query,
    format: 'text',
  });

  const requestSize = new Blob([requestBody]).size + 200; // +200 for headers estimate

  const startTime = performance.now();
  let firstChunkTime = 0;
  let chunkCount = 0;
  let responseSize = 0;

  const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cookie': `super-app.session_token=${SESSION_TOKEN}`,
    },
    body: requestBody,
  });

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Request failed with status ${response.status}: ${text}`);
  }

  const firstByteTime = performance.now();
  const uploadTime = firstByteTime - startTime;

  // Read stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstChunkTime === 0) {
        firstChunkTime = performance.now() - startTime;
      }

      responseSize += value.length;
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

            if (eventType === 'chunk') {
              chunkCount++;
            }

            if (eventType === 'complete' || eventType === 'error') {
              reader.cancel();
              break;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const downloadTime = endTime - firstByteTime;
    const processingTime = totalTime - uploadTime - downloadTime;

    return {
      query,
      requestSize,
      responseSize,
      uploadTime,
      processingTime,
      downloadTime,
      totalTime,
      firstChunkTime,
      chunkCount,
    };
  }
}

/**
 * Run benchmark suite
 */
async function runBenchmark() {
  console.log('🔬 Response Time Benchmark\n');
  console.log('━'.repeat(80));

  if (!SESSION_TOKEN) {
    console.log('\n❌ Error: SESSION_TOKEN not provided');
    console.log('Usage: SESSION_TOKEN=xxx bun benchmark-response-time.ts\n');
    return;
  }

  const queries = [
    'What is 2+2?', // Simple (no tools)
    'What courses am I taking?', // Medium (1 tool)
    'What is in my lab 4 of cs?', // Complex (multiple tools)
  ];

  const results: TimingResult[] = [];

  for (const query of queries) {
    console.log(`\n📝 Testing query: "${query}"`);
    console.log('⏳ Measuring...');

    try {
      const result = await measureStreamingRequest(query);
      results.push(result);

      console.log(`✅ Complete`);
      console.log(`   Total time: ${result.totalTime.toFixed(1)}ms`);
      console.log(`   First chunk: ${result.firstChunkTime.toFixed(1)}ms`);
      console.log(`   Request size: ${(result.requestSize / 1024).toFixed(1)} KB`);
      console.log(`   Response size: ${(result.responseSize / 1024).toFixed(1)} KB`);
    } catch (error: any) {
      console.log(`❌ Failed: ${error.message}`);
    }

    // Wait between requests to avoid rate limits
    if (queries.indexOf(query) < queries.length - 1) {
      console.log('   Waiting 3s before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n━'.repeat(80));
  console.log('\n📊 Detailed Results\n');

  // Print detailed breakdown
  for (const result of results) {
    console.log(`Query: "${result.query}"`);
    console.log(`  Request size:      ${(result.requestSize / 1024).toFixed(2)} KB`);
    console.log(`  Response size:     ${(result.responseSize / 1024).toFixed(2)} KB`);
    console.log(`  Upload time:       ${result.uploadTime.toFixed(1)}ms`);
    console.log(`  Processing time:   ${result.processingTime.toFixed(1)}ms`);
    console.log(`  Download time:     ${result.downloadTime.toFixed(1)}ms`);
    console.log(`  Total time:        ${result.totalTime.toFixed(1)}ms`);
    console.log(`  First chunk:       ${result.firstChunkTime.toFixed(1)}ms`);
    console.log(`  Chunk count:       ${result.chunkCount}`);
    console.log('');
  }

  console.log('━'.repeat(80));
  console.log('\n💡 Optimization Analysis\n');

  // Calculate averages
  const avgRequestSize = results.reduce((sum, r) => sum + r.requestSize, 0) / results.length;
  const avgUploadTime = results.reduce((sum, r) => sum + r.uploadTime, 0) / results.length;
  const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
  const avgFirstChunk = results.reduce((sum, r) => sum + r.firstChunkTime, 0) / results.length;

  console.log('Current Implementation (Full Prompt Sent):');
  console.log(`  Avg request size:    ${(avgRequestSize / 1024).toFixed(2)} KB`);
  console.log(`  Avg upload time:     ${avgUploadTime.toFixed(1)}ms`);
  console.log(`  Avg first chunk:     ${avgFirstChunk.toFixed(1)}ms`);
  console.log(`  Avg total time:      ${avgTotalTime.toFixed(1)}ms`);
  console.log('');

  // Estimate with cachedContent
  const systemPromptSize = 7000; // ~7KB
  const optimizedRequestSize = avgRequestSize - systemPromptSize;

  // Estimate upload time is roughly proportional to size
  const sizeRatio = optimizedRequestSize / avgRequestSize;
  const optimizedUploadTime = avgUploadTime * sizeRatio;
  const uploadTimeSaved = avgUploadTime - optimizedUploadTime;
  const optimizedFirstChunk = avgFirstChunk - uploadTimeSaved;
  const optimizedTotalTime = avgTotalTime - uploadTimeSaved;

  console.log('With cachedContent Optimization (Estimated):');
  console.log(`  Avg request size:    ${(optimizedRequestSize / 1024).toFixed(2)} KB  (${((1 - sizeRatio) * 100).toFixed(1)}% reduction)`);
  console.log(`  Avg upload time:     ${optimizedUploadTime.toFixed(1)}ms  (${uploadTimeSaved.toFixed(1)}ms faster)`);
  console.log(`  Avg first chunk:     ${optimizedFirstChunk.toFixed(1)}ms  (${uploadTimeSaved.toFixed(1)}ms faster)`);
  console.log(`  Avg total time:      ${optimizedTotalTime.toFixed(1)}ms  (${uploadTimeSaved.toFixed(1)}ms faster)`);
  console.log('');

  console.log('━'.repeat(80));
  console.log('\n🎯 Summary\n');

  const bandwidthSaved = ((1 - sizeRatio) * 100).toFixed(1);
  const timeSavedPercent = ((uploadTimeSaved / avgTotalTime) * 100).toFixed(1);

  console.log(`✅ Bandwidth saved:       ${bandwidthSaved}% (${(systemPromptSize / 1024).toFixed(1)} KB per request)`);
  console.log(`✅ Upload time saved:     ${uploadTimeSaved.toFixed(1)}ms per request`);
  console.log(`✅ First chunk faster by: ${uploadTimeSaved.toFixed(1)}ms (${timeSavedPercent}% of total time)`);
  console.log(`✅ Total time saved:      ${uploadTimeSaved.toFixed(1)}ms (${timeSavedPercent}% improvement)`);
  console.log('');

  // Recommendation
  if (uploadTimeSaved > 50) {
    console.log('💰 Recommendation: IMPLEMENT cachedContent optimization');
    console.log(`   Saving ${uploadTimeSaved.toFixed(0)}ms per request is significant!`);
    console.log(`   This is especially beneficial on slower connections.`);
  } else if (uploadTimeSaved > 20) {
    console.log('⚖️  Recommendation: cachedContent optimization is OPTIONAL');
    console.log(`   Saving ${uploadTimeSaved.toFixed(0)}ms per request is noticeable but not critical.`);
    console.log(`   Consider implementing if you have many concurrent users.`);
  } else {
    console.log('ℹ️  Recommendation: Current implementation is FINE');
    console.log(`   Saving only ${uploadTimeSaved.toFixed(0)}ms per request - overhead is minimal.`);
    console.log(`   The added complexity of cachedContent may not be worth it.`);
  }

  console.log('\n━'.repeat(80));
  console.log('\n📈 Per-Query Breakdown\n');

  for (const result of results) {
    const estimatedSaved = result.uploadTime * (1 - sizeRatio);
    const percentSaved = (estimatedSaved / result.totalTime) * 100;

    console.log(`"${result.query}"`);
    console.log(`  Current:   ${result.totalTime.toFixed(0)}ms total (${result.firstChunkTime.toFixed(0)}ms to first chunk)`);
    console.log(`  Optimized: ${(result.totalTime - estimatedSaved).toFixed(0)}ms total (${(result.firstChunkTime - estimatedSaved).toFixed(0)}ms to first chunk)`);
    console.log(`  Savings:   ${estimatedSaved.toFixed(0)}ms (${percentSaved.toFixed(1)}% faster)`);
    console.log('');
  }

  console.log('━'.repeat(80));
  console.log('\n✨ Benchmark complete!\n');
}

// Run benchmark
runBenchmark().catch(console.error);

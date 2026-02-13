#!/usr/bin/env bun

/**
 * Basic Vertex AI connectivity test
 * Tests if Vertex AI works at all before trying streaming
 */

import { VertexAI } from '@google-cloud/vertexai';

async function testVertexAI() {
  console.log('🧪 Testing Vertex AI Basic Connectivity\n');

  // Set up credentials explicitly
  const credPath = 'keys.json';
  const fullCredPath = credPath.startsWith('/') ? credPath : `${process.cwd()}/${credPath}`;

  // Set as environment variable for the SDK to pick up
  process.env.GOOGLE_APPLICATION_CREDENTIALS = fullCredPath;

  const projectId = 'vivid-spot-311815';
  const location = 'global'; // Try regional endpoint instead of global
  // Use gemini-1.5-flash which is GA and definitely available
  const modelName = 'gemini-3-flash-preview';

  console.log('Configuration:');
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Location: ${location}`);
  console.log(`  Model: ${modelName}`);
  console.log(`  Credentials: ${fullCredPath}`);

  // Check if credentials file exists
  try {
    const file = Bun.file(fullCredPath);
    const exists = await file.exists();
    if (exists) {
      console.log(`  ✅ Credentials file found`);
    } else {
      console.log(`  ❌ Credentials file not found at: ${fullCredPath}`);
      process.exit(1);
    }
  } catch (e) {
    console.log(`  ⚠️  Could not check credentials file`);
  }
  console.log('');

  if (!projectId) {
    console.error('❌ GCP_PROJECT_ID not set in .env');
    process.exit(1);
  }

  try {
    console.log('1️⃣ Initializing Vertex AI...');
    const vertexAI = new VertexAI({ project: projectId, location });
    console.log('✅ Vertex AI initialized\n');

    console.log('2️⃣ Getting generative model...');
    const model = vertexAI.getGenerativeModel({ model: modelName });
    console.log('✅ Model instance created\n');

    console.log('3️⃣ Testing simple generateContent (non-streaming)...');

    // Intercept fetch to see raw responses
    const originalFetch = globalThis.fetch;
    let lastResponse: any = null;
    globalThis.fetch = async (...args: any[]) => {
      const response = await originalFetch(...args);
      lastResponse = response.clone();
      return response;
    };

    const startTime = Date.now();

    try {
      const result = await model.generateContent('Say hello in 5 words or less');
      const elapsed = Date.now() - startTime;
      console.log('Result:', result);

      const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        console.log(`✅ Non-streaming works! (${elapsed}ms)`);
        console.log(`   Response: "${text}"\n`);
      } else {
        console.log('⚠️  Got response but no text');
        console.log('   Response:', JSON.stringify(result.response, null, 2));
      }
    } catch (error: any) {
      globalThis.fetch = originalFetch; // Restore original fetch

      console.error('❌ Non-streaming failed:', error.message);
      console.error('   Error type:', error.constructor.name);

      // Try to get the actual response body
      if (lastResponse) {
        console.log('\n🔍 Actual API Response:');
        console.log('   Status:', lastResponse.status, lastResponse.statusText);
        console.log('   Headers:', Object.fromEntries(lastResponse.headers.entries()));

        try {
          const responseText = await lastResponse.text();
          console.log('   Body:', responseText);

          // Try to parse as JSON
          try {
            const json = JSON.parse(responseText);
            console.log('\n📋 Parsed Error:');
            console.log(JSON.stringify(json, null, 2));
          } catch {
            console.log('\n📋 Body is not JSON, raw text above');
          }
        } catch (e) {
          console.log('   Could not read response body');
        }
      }

      console.log('\n💡 Common causes:');
      console.log('   1. Model name not available in this region');
      console.log('   2. Vertex AI API not enabled for this project');
      console.log('   3. Authentication/permissions issue');
      console.log('   4. Quota exceeded');
      console.log('\n   Try running: gcloud auth application-default login\n');

      return;
    }

    console.log('4️⃣ Testing generateContentStream (streaming)...');
    try {
      const streamStartTime = Date.now();
      const streamResult = await model.generateContentStream('Count from 1 to 5, one number per sentence');

      console.log('✅ Stream created, consuming chunks...\n');

      let chunkCount = 0;
      for await (const chunk of streamResult.stream) {
        chunkCount++;
        const chunkTime = Date.now() - streamStartTime;
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`   Chunk #${chunkCount} at +${chunkTime}ms: "${text || '(empty)'}"`);
      }

      const totalTime = Date.now() - streamStartTime;
      console.log(`\n✅ Streaming works! Got ${chunkCount} chunks in ${totalTime}ms\n`);

      // Analyze if it's real streaming
      if (chunkCount > 1) {
        console.log('📊 Streaming Analysis:');
        console.log(`   This test should show if chunks arrive over time or all at once.`);
        console.log(`   Look at the timestamps above - if they're all similar (within 10ms),`);
        console.log(`   then Vertex AI is buffering. If they're spread out, it's truly streaming.\n`);
      }

    } catch (streamError: any) {
      console.error('❌ Streaming failed:', streamError.message);
      console.error('   Stack:', streamError.stack);
      return;
    }

    console.log('🎉 All tests passed!\n');
    console.log('Next steps:');
    console.log('  - If streaming chunks had different timestamps: True streaming works! ✅');
    console.log('  - If all chunks came at same time: Vertex AI buffers before streaming ⚠️');
    console.log('  - The SSE server should work the same way\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testVertexAI();

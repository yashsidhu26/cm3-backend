/**
 * Check Available Gemini Models in Vertex AI
 * Run: bun run scripts/check-available-models.ts
 */

import { VertexAI } from '@google-cloud/vertexai';

async function checkAvailableModels() {
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || 'us-central1';

  if (!projectId) {
    console.error('❌ GCP_PROJECT_ID not set in .env');
    process.exit(1);
  }

  console.log(`\n🔍 Checking available Gemini models...`);
  console.log(`📍 Project: ${projectId}`);
  console.log(`📍 Location: ${location}\n`);

  const vertexAI = new VertexAI({ project: projectId, location });

  // Models to test
  const modelsToTest = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-pro',
    'gemini-flash',
  ];

  console.log('Testing models:\n');

  for (const modelName of modelsToTest) {
    try {
      const model = vertexAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });

      const response = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (response) {
        console.log(`✅ ${modelName.padEnd(30)} - Available`);
      } else {
        console.log(`⚠️  ${modelName.padEnd(30)} - Returned empty response`);
      }
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        console.log(`❌ ${modelName.padEnd(30)} - Not found`);
      } else if (error.message?.includes('PERMISSION_DENIED')) {
        console.log(`🔒 ${modelName.padEnd(30)} - Permission denied`);
      } else {
        console.log(`❓ ${modelName.padEnd(30)} - Error: ${error.message?.substring(0, 50)}`);
      }
    }
  }

  console.log(`\n✅ Check complete!\n`);
}

checkAvailableModels().catch(console.error);

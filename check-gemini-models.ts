/**
 * Check available Gemini models
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  console.log('🔍 Fetching available Gemini models...\n');

  try {
    // Try a few common model names to see which ones work
    const modelsToTest = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-exp',
      'gemini-2.5-flash-lite',
      'gemini-3-flash',
      'gemini-exp-1206',
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash-thinking-exp',
    ];

    console.log('Testing model availability:\n');

    for (const modelName of modelsToTest) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hi');
        const text = result.response.text();
        console.log(`✅ ${modelName} - Available (response: ${text.substring(0, 30)}...)`);
      } catch (error: any) {
        if (error.message.includes('not found')) {
          console.log(`❌ ${modelName} - Not found`);
        } else if (error.message.includes('quota')) {
          console.log(`⚠️  ${modelName} - Quota exceeded (but model exists)`);
        } else {
          console.log(`❌ ${modelName} - Error: ${error.message.substring(0, 50)}`);
        }
      }
    }

    console.log('\n📝 Recommended models:');
    console.log('   - Default: gemini-2.0-flash-exp (fast, general purpose)');
    console.log('   - Thinking: gemini-2.0-flash-thinking-exp (reasoning, planning)');
    console.log('   - Stable: gemini-1.5-flash (production ready)');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

listModels();

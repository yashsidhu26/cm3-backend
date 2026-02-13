
import { GoogleGenAI } from '@google/genai';

async function main() {
    const projectId = process.env.GCP_PROJECT_ID || 'vivid-spot-311815';
    const location = 'global';

    console.log(`Initializing GoogleGenAI with project: ${projectId}, location: ${location}`);

    try {
        const ai = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: location,
        });

        console.log('Generating content stream with gemini-3-flash-preview...');

        try {
            const response = await ai.models.generateContentStream({
                model: 'gemini-3-flash-preview',
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: 'Write a haiku about coding.' }]
                    }
                ],
            });

            console.log('Stream started.');

            for await (const chunk of response) {
                const text = chunk.text;
                process.stdout.write(text || '');
            }
            console.log('\nStream complete.');
        } catch (e: any) {
            console.error('Generation failed:', e.message);
            console.error('Full error:', JSON.stringify(e, null, 2));
        }
    } catch (error) {
        console.error('Initialization error:', error);
    }
}

main();


import { GoogleGenAI } from '@google/genai';

async function main() {
    const projectId = process.env.GCP_PROJECT_ID || 'vivid-spot-311815';
    const location = 'global';

    const ai = new GoogleGenAI({ vertexai: true, project: projectId, location });

    const weatherTool = {
        name: 'get_weather',
        description: 'Get the weather for a location',
        parameters: {
            type: 'OBJECT',
            properties: {
                location: { type: 'STRING' },
            },
            required: ['location'],
        },
    };

    const model = 'gemini-3-flash-preview';

    console.log('Sending initial query...');

    try {
        const result1 = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: 'What is the weather in London?' }] }],
            config: {
                tools: [{ functionDeclarations: [weatherTool] }],
            },
        });

        console.log('Use candidates?', result1.candidates ? 'Yes' : 'No');
        console.log('Candidates length:', result1.candidates?.length);
        const firstPart = result1.candidates?.[0]?.content?.parts?.[0];
        console.log('First part keys:', firstPart ? Object.keys(firstPart) : 'None');
        console.log('Function call:', JSON.stringify(firstPart?.functionCall, null, 2));

        if (firstPart?.functionCall) {
            const call = firstPart.functionCall;

            // Send response
            console.log('Sending function response...');
            const result2 = await ai.models.generateContent({
                model,
                contents: [
                    { role: 'user', parts: [{ text: 'What is the weather in London?' }] },
                    { role: 'model', parts: [firstPart] },
                    {
                        role: 'user', // Vertex AI expects function response as 'user' role usually?
                        // Or 'function'?
                        // README says "Send the result back to the model (with history, easier in ai.chat) as a FunctionResponse" but doesn't show manual structure.
                        // Standard Gemini uses 'function' role. Vertex uses 'user' role with functionResponse part?
                        // Let's try 'user' role with 'functionResponse' part property.
                        parts: [{
                            functionResponse: {
                                name: call.name,
                                response: { name: call.name, content: { weather: 'Sunny' } }
                            }
                        }]
                    }
                ],
                config: {
                    tools: [{ functionDeclarations: [weatherTool] }],
                }
            });

            console.log('Final response:', result2.candidates?.[0]?.content?.parts?.[0]?.text);
        }

    } catch (e: any) {
        console.error('Error:', e);
        console.error('Full error:', JSON.stringify(e, null, 2));
    }
}

main();

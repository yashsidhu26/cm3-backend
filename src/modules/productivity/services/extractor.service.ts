import OpenAI from 'openai';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { StudentProfile } from '../schemas/profile.schema';
import { ExtractedTasksResponse } from '../schemas/ai.schema';

export class ExtractorService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.GROQ_API_KEY || process.env.XAI_API_KEY,
            baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        });
    }

    async extractTasks(transcript: string, profile: StudentProfile): Promise<ExtractedTasksResponse> {
        const response = await this.openai.chat.completions.create({
            model: process.env.EXTRACTOR_MODEL || 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPTS.EXTRACTOR },
                {
                    role: 'user',
                    content: `
            Transcript: ${transcript}
            Active Courses: ${JSON.stringify(profile.activeCourses)}
            Preferences: ${JSON.stringify(profile.preferences)}
          `
                },
            ],
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error('Failed to extract tasks: Empty response from AI');
        }

        return JSON.parse(content) as ExtractedTasksResponse;
    }
}

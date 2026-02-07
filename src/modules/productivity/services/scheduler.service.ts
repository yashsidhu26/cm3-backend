import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { StudentProfile } from '../schemas/profile.schema';
import { ExtractedTask, ScheduleResponse } from '../schemas/ai.schema';

export class SchedulerService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

        // Define the schema for structured output
        const responseSchema = {
            description: "Schedule response",
            type: SchemaType.OBJECT,
            properties: {
                efficiencyScore: {
                    type: SchemaType.NUMBER,
                    description: "Efficiency score between 0 and 100",
                },
                blocks: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            startTime: { type: SchemaType.STRING },
                            endTime: { type: SchemaType.STRING },
                            taskTitle: { type: SchemaType.STRING },
                            activityType: {
                                type: SchemaType.STRING,
                                enum: ['deep_work', 'shallow_work', 'break', 'chore']
                            },
                        },
                        required: ['startTime', 'endTime', 'taskTitle', 'activityType'],
                    },
                },
            },
            required: ['efficiencyScore', 'blocks'],
        };

        this.model = this.genAI.getGenerativeModel({
            model: process.env.SCHEDULER_MODEL || 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });
    }

    async createSchedule(tasks: ExtractedTask[], profile: StudentProfile): Promise<ScheduleResponse> {
        const prompt = `
      ${SYSTEM_PROMPTS.SCHEDULER}
      
      Extracted Tasks: ${JSON.stringify(tasks)}
      Existing Schedule (Hard Constraints): ${JSON.stringify(profile.existingSchedule)}
      Preferences (Chronotype & Focus): ${JSON.stringify(profile.preferences)}
    `;

        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return JSON.parse(text) as ScheduleResponse;
    }
}

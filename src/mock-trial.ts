import { ProductivityModule } from './modules/productivity/productivity.module';
import type { StudentProfile } from './modules/productivity/schemas/profile.schema';

// Set dummy env vars so constructors don't fail if keys are missing
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'dummy';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'dummy';

async function runMockTrial() {
    console.log('====================================================');
    console.log('🚀 CM3 BACKEND MOCK TRIAL');
    console.log('====================================================\n');

    // 1. GMAIL AUTH MOCK
    console.log('--- Step 1: Gmail Authentication (Mock) ---');
    const mockEmail = "student.success@gmail.com";
    console.log(`✅ [GmailAuth] Successfully connected to: ${mockEmail}`);
    console.log(`✅ [GmailAuth] Tokens stored securely for User: demo-user-123\n`);

    // 2. PRODUCTIVITY PIPELINE MOCK
    console.log('--- Step 2: Productivity Planning Pipeline ---');
    const productivity = new ProductivityModule();

    const demoTranscript = "I need to finish my CS101 assignment, it's really important. Also, I have a calc quiz tomorrow I need to study for. And maybe a quick 15 min break.";
    const demoProfile: StudentProfile = {
        existingSchedule: [
            { startTime: "09:00", endTime: "10:30", title: "CS101 Lecture", type: "class" }
        ],
        preferences: {
            chronotype: "EarlyBird",
            focusDuration: 45
        },
        activeCourses: [
            { code: "CS101", name: "Intro to CS" },
            { code: "MATH202", name: "Calculus II" }
        ]
    };

    console.log('Input Transcript:', demoTranscript);

    // Check for API keys, if not present or they are dummies, we will use mock data for the demo
    const hasKeys = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'dummy' &&
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'dummy';

    if (!hasKeys) {
        console.log('\n⚠️ [Productivity] API keys missing. Using mock AI output for demonstration.');

        const mockResult = {
            efficiencyScore: 92,
            blocks: [
                { startTime: "10:30", endTime: "11:15", taskTitle: "CS101 Assignment (Deep Work)", activityType: "deep_work" },
                { startTime: "11:15", endTime: "11:30", taskTitle: "Break", activityType: "break" },
                { startTime: "11:30", endTime: "12:15", taskTitle: "Calculus II Study (Focus Session)", activityType: "deep_work" }
            ]
        };

        console.log('Pipeline Result (Mocked):');
        console.log(JSON.stringify(mockResult, null, 2));
    } else {
        try {
            const result = await productivity.planDay("demo-user-123", demoTranscript, demoProfile);
            console.log('Pipeline Result (Actual AI):');
            console.log(JSON.stringify(result, null, 2));
        } catch (error: any) {
            console.error('❌ Pipeline failed:', error.message);
        }
    }

    console.log('\n====================================================');
    console.log('🎉 MOCK TRIAL COMPLETE');
    console.log('====================================================');
}

runMockTrial();

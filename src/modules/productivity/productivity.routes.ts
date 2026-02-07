import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ProductivityModule } from './productivity.module';
import type { StudentProfile } from './schemas/profile.schema';

const productivityRoutes = new Hono();

// Mock profile loader for immediate use as requested
const mockProfileLoader = async (userId: string): Promise<StudentProfile> => {
    return {
        existingSchedule: [
            { startTime: "09:00", endTime: "10:30", title: "CS101 Lecture", type: "class" },
            { startTime: "13:00", endTime: "14:00", title: "Lunch with Mentor", type: "personal" },
        ],
        preferences: {
            chronotype: "EarlyBird",
            focusDuration: 45,
        },
        activeCourses: [
            { code: "CS101", name: "Introduction to Computer Science" },
            { code: "BIO101", name: "Biology 101" },
            { code: "MATH202", name: "Calculus II" },
        ],
    };
};

productivityRoutes.post(
    '/plan',
    zValidator(
        'json',
        z.object({
            userId: z.string(),
            transcript: z.string(),
        })
    ),
    async (c) => {
        const { userId, transcript } = c.req.valid('json');

        try {
            // Load profile (mocked for now)
            const profile = await mockProfileLoader(userId);

            const module = new ProductivityModule();
            // Execute the pipeline
            const result = await module.planDay(userId, transcript, profile);

            return c.json(result);
        } catch (error: any) {
            console.error('[ProductivityRoutes] Error planning day:', error);
            return c.json({ error: error.message || 'Internal Server Error' }, 500);
        }
    }
);

export default productivityRoutes;

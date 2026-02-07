import { z } from 'zod';

export const StudentProfileSchema = z.object({
    existingSchedule: z.array(z.object({
        startTime: z.string(), // ISO or "HH:mm"
        endTime: z.string(),
        title: z.string(),
        type: z.enum(['class', 'work', 'personal', 'appointment', 'other']),
    })),
    preferences: z.object({
        chronotype: z.enum(['EarlyBird', 'NightOwl']),
        focusDuration: z.number().describe('Preferred duration of focus blocks in minutes'),
    }),
    activeCourses: z.array(z.object({
        code: z.string(),
        name: z.string(),
    })),
});

export type StudentProfile = z.infer<typeof StudentProfileSchema>;

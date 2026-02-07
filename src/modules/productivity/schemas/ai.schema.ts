import { z } from 'zod';

export const ExtractedTaskSchema = z.object({
    title: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    estimatedDuration: z.number().describe('Estimated duration in minutes'),
    courseId: z.string().optional(),
});

export const ExtractedTasksResponseSchema = z.object({
    tasks: z.array(ExtractedTaskSchema),
});

export const ScheduleBlockSchema = z.object({
    startTime: z.string(),
    endTime: z.string(),
    taskTitle: z.string(),
    activityType: z.enum(['deep_work', 'shallow_work', 'break', 'chore']),
});

export const ScheduleResponseSchema = z.object({
    efficiencyScore: z.number().min(0).max(100),
    blocks: z.array(ScheduleBlockSchema),
});

export type ExtractedTask = z.infer<typeof ExtractedTaskSchema>;
export type ScheduleBlock = z.infer<typeof ScheduleBlockSchema>;
export type ScheduleResponse = z.infer<typeof ScheduleResponseSchema>;
export type ExtractedTasksResponse = z.infer<typeof ExtractedTasksResponseSchema>;

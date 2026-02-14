import { z } from 'zod';

export const goalEnum = z.enum([
  'take_break',
  'academics',
  'personal_goals',
  'assignments_projects',
  'learn_new',
]);

export const skipClassEnum = z.enum(['lesson', 'tutorial', 'lab']);

export const timeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const optimizeDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dayWindow: timeSlotSchema.optional(),
  sleepWindow: timeSlotSchema.optional(),
  goals: z.array(goalEnum).min(1),
  skipClasses: z.array(skipClassEnum).optional().default([]),
  preferredFreeTime: timeSlotSchema.optional(),
  additionalPreferences: z.string().max(4000).optional(),
  selectedCourseIds: z.array(z.string()).optional(),
  selectedSkillIds: z.array(z.string()).optional(),
  scheduleName: z.string().max(255).optional(),
});

export const editScheduleSchema = z.object({
  scheduleId: z.string(),
  instruction: z.string().min(1).max(4000),
  dayWindow: timeSlotSchema.optional(),
  sleepWindow: timeSlotSchema.optional(),
  preferredFreeTime: timeSlotSchema.optional(),
  additionalPreferences: z.string().max(4000).optional(),
  goals: z.array(goalEnum).optional(),
  skipClasses: z.array(skipClassEnum).optional(),
});

export const aiScheduleItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['custom', 'assignment', 'evaluation', 'event', 'class']),
  startDateTime: z.string(),
  endDateTime: z.string(),
  linkedEntityId: z.string().optional().nullable(),
  linkedEntityType: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
});

export const aiScheduleResponseSchema = z.object({
  scheduleItems: z.array(aiScheduleItemSchema),
});

export type OptimizeDayRequest = z.infer<typeof optimizeDaySchema>;
export type EditScheduleRequest = z.infer<typeof editScheduleSchema>;

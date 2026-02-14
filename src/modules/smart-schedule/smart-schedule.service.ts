import { GoogleGenAI } from '@google/genai';
import { and, eq, gte, lte, or } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { schedules, scheduleItems, studentAssignments, studentEvaluations, campusEvents } from '../student-profile/student-profile.schema';
import { academicsService } from '../academics/academics.service';
import { sectionsService } from '../academics/sections.service';
import { skillsInterestsService } from '../skills-interests/skills-interests.service';
import type { OptimizeDayRequest, EditScheduleRequest } from './smart-schedule.schema';
import { aiScheduleResponseSchema } from './smart-schedule.schema';

const DEFAULT_DAY_START = '06:00';
const DEFAULT_DAY_END = '23:00';

type FixedBlock = {
  title: string;
  description?: string | null;
  type: 'class' | 'evaluation' | 'event' | 'custom';
  startDateTime: Date;
  endDateTime: Date;
  linkedEntityId?: string | null;
  linkedEntityType?: string | null;
  location?: string | null;
};

function toDateTime(dateStr: string, timeStr: string, addDay: boolean = false): Date {
  const base = new Date(`${dateStr}T${timeStr}:00`);
  if (addDay) {
    base.setDate(base.getDate() + 1);
  }
  return base;
}

function normalizeDayWindow(dateStr: string, window?: { start: string; end: string }) {
  const startTime = window?.start || DEFAULT_DAY_START;
  const endTime = window?.end || DEFAULT_DAY_END;
  const start = toDateTime(dateStr, startTime);
  const endRaw = toDateTime(dateStr, endTime);
  // If end time is earlier than start, it means sleep crosses midnight.
  const end = endRaw <= start ? toDateTime(dateStr, endTime, true) : endRaw;
  return { start, end };
}

function normalizeSleepWindow(
  dateStr: string,
  dayWindow: { start: Date; end: Date },
  sleepWindow?: { start: string; end: string }
) {
  if (!sleepWindow) {
    return {
      start: new Date(dayWindow.end),
      end: new Date(dayWindow.start.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  const start = toDateTime(dateStr, sleepWindow.start);
  let end = toDateTime(dateStr, sleepWindow.end);
  if (end <= start) {
    end = toDateTime(dateStr, sleepWindow.end, true);
  }
  return { start, end };
}

// Sleep handling is AI-driven; backend only applies explicit sleepWindow.

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function computeFreeSlots(dayStart: Date, dayEnd: Date, fixedBlocks: FixedBlock[]) {
  const sorted = [...fixedBlocks].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
  const slots: Array<{ startDateTime: Date; endDateTime: Date }> = [];
  let cursor = dayStart;

  for (const block of sorted) {
    if (block.startDateTime > cursor) {
      slots.push({ startDateTime: new Date(cursor), endDateTime: new Date(block.startDateTime) });
    }
    if (block.endDateTime > cursor) {
      cursor = new Date(block.endDateTime);
    }
  }

  if (cursor < dayEnd) {
    slots.push({ startDateTime: new Date(cursor), endDateTime: new Date(dayEnd) });
  }

  return slots.filter((slot) => slot.endDateTime > slot.startDateTime);
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response');
  }
  const slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

function normalizeCourseSelection(courses: any[], selectedCourseIds?: string[]) {
  if (!selectedCourseIds || selectedCourseIds.length === 0) return courses;
  const selected = new Set(selectedCourseIds);
  return courses.filter((c) => selected.has(c.course?.id) || selected.has(c.course?.code));
}

function normalizeSkillSelection(skills: any[], selectedSkillIds?: string[]) {
  if (!selectedSkillIds || selectedSkillIds.length === 0) return skills;
  const selected = new Set(selectedSkillIds);
  return skills.filter((s) => selected.has(s.skill?.id));
}

function mapSkipTypes(skipClasses: string[]) {
  const normalized = skipClasses.map((s) => s.toLowerCase());
  return {
    lecture: normalized.includes('lesson'),
    tutorial: normalized.includes('tutorial'),
    lab: normalized.includes('lab'),
  };
}

export class SmartScheduleService {
  private buildAiClient() {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) throw new Error('GCP_PROJECT_ID not configured');
    const location = process.env.GCP_LOCATION || 'global';
    return new GoogleGenAI({ vertexai: true, project: projectId, location });
  }

  private getModelName() {
    return process.env.SMART_SCHEDULE_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  private getFallbackModelName() {
    return process.env.SMART_SCHEDULE_FALLBACK_MODEL || 'gemini-2.5-flash';
  }

  private isModelNotFound(error: any) {
    const message = error?.message || '';
    return (
      message.includes('Model') && message.includes('was not found') ||
      message.includes('NOT_FOUND') ||
      message.includes('Publisher Model')
    );
  }

  private async generateContentWithFallback(payload: {
    systemPrompt: string;
    userPrompt: string;
  }) {
    const ai = this.buildAiClient();
    const primaryModel = this.getModelName();
    const fallbackModel = this.getFallbackModelName();

    try {
      return await ai.models.generateContent({
        model: primaryModel,
        contents: [{ role: 'user', parts: [{ text: payload.userPrompt }] }],
        config: {
          systemInstruction: { parts: [{ text: payload.systemPrompt }] },
          temperature: 0.2,
        },
      });
    } catch (error: any) {
      if (this.isModelNotFound(error) && fallbackModel !== primaryModel) {
        console.warn('[SmartSchedule] Primary model not found, falling back:', primaryModel, '->', fallbackModel);
        return await ai.models.generateContent({
          model: fallbackModel,
          contents: [{ role: 'user', parts: [{ text: payload.userPrompt }] }],
          config: {
            systemInstruction: { parts: [{ text: payload.systemPrompt }] },
            temperature: 0.2,
          },
        });
      }
      throw error;
    }
  }

  private async getContext(userId: string, dateStr: string, request: OptimizeDayRequest) {
    const window = normalizeDayWindow(dateStr, request.dayWindow);
    const sleepWindow = request.sleepWindow ? normalizeSleepWindow(dateStr, window, request.sleepWindow) : null;
    const dayStart = window.start;
    const dayEnd = window.end;
    const dayName = dayOfWeek(dateStr);

    const [courses, skills, classSchedule] = await Promise.all([
      academicsService.getUserCoursesWithResources(userId),
      skillsInterestsService.getUserSkills(userId),
      sectionsService.getUserSchedule(userId),
    ]);

    const upcomingAssignments = await db
      .select()
      .from(studentAssignments)
      .where(
        and(
          eq(studentAssignments.userId, userId),
          gte(studentAssignments.dueDate, new Date(dateStr + 'T00:00:00'))
        )
      )
      .orderBy(studentAssignments.dueDate);

    const upcomingEvaluations = await db
      .select()
      .from(studentEvaluations)
      .where(
        and(
          eq(studentEvaluations.userId, userId),
          gte(studentEvaluations.date, new Date(dateStr + 'T00:00:00'))
        )
      )
      .orderBy(studentEvaluations.date);

    const events = await db
      .select()
      .from(campusEvents)
      .where(
        and(
          eq(campusEvents.userId, userId),
          gte(campusEvents.date, dayStart),
          lte(campusEvents.date, dayEnd),
          or(eq(campusEvents.isEnrolled, true), eq(campusEvents.isInterested, true))
        )
      )
      .orderBy(campusEvents.date);

    const skipMap = mapSkipTypes(request.skipClasses || []);

    const fixedBlocks: FixedBlock[] = [];

    for (const entry of classSchedule) {
      for (const timing of entry.schedule) {
        if (timing.dayOfWeek !== dayName) continue;
        const sectionType = (entry.sectionType || '').toLowerCase();
        if (sectionType.includes('lecture') && skipMap.lecture) continue;
        if (sectionType.includes('tutorial') && skipMap.tutorial) continue;
        if (sectionType.includes('lab') && skipMap.lab) continue;

        fixedBlocks.push({
          title: `${entry.courseCode} ${entry.sectionType} ${entry.sectionNumber}`,
          description: entry.courseName,
          type: 'class',
          startDateTime: toDateTime(dateStr, timing.startTime),
          endDateTime: toDateTime(dateStr, timing.endTime),
          linkedEntityId: entry.sectionId,
          linkedEntityType: 'section',
          location: entry.roomNumber || null,
        });
      }
    }

    for (const evaluation of upcomingEvaluations) {
      const evalDate = new Date(evaluation.date);
      if (evalDate >= dayStart && evalDate <= dayEnd) {
        const end = evaluation.duration
          ? new Date(evalDate.getTime() + this.parseDuration(evaluation.duration))
          : new Date(evalDate.getTime() + 90 * 60 * 1000);
        fixedBlocks.push({
          title: `${evaluation.courseCode || ''} ${evaluation.title}`.trim(),
          description: evaluation.type,
          type: 'evaluation',
          startDateTime: evalDate,
          endDateTime: end,
          linkedEntityId: evaluation.id,
          linkedEntityType: 'evaluation',
          location: evaluation.location || null,
        });
      }
    }

    for (const event of events) {
      const start = new Date(event.date);
      const end = event.endDate ? new Date(event.endDate) : new Date(start.getTime() + 90 * 60 * 1000);
      fixedBlocks.push({
        title: event.title,
        description: event.type,
        type: 'event',
        startDateTime: start,
        endDateTime: end,
        linkedEntityId: event.id,
        linkedEntityType: 'event',
        location: event.location || null,
      });
    }

    // Add sleep block only when explicitly provided.
    if (sleepWindow) {
      fixedBlocks.push({
        title: 'Sleep',
        description: 'Sleep / rest window',
        type: 'custom',
        startDateTime: new Date(sleepWindow.start),
        endDateTime: new Date(sleepWindow.end),
      });
    }

    const freeSlots = computeFreeSlots(dayStart, dayEnd, fixedBlocks);

    return {
      dateStr,
      dayName,
      dayStart,
      dayEnd,
      courses: normalizeCourseSelection(courses, request.selectedCourseIds),
      skills: normalizeSkillSelection(skills, request.selectedSkillIds),
      assignments: upcomingAssignments.filter((a) => !['submitted', 'graded'].includes(a.status || '')),
      evaluations: upcomingEvaluations,
      events,
      fixedBlocks,
      freeSlots,
    };
  }

  private parseDuration(duration?: string | null) {
    if (!duration) return 60 * 60 * 1000;
    const minutesMatch = duration.match(/(\d+)/);
    if (!minutesMatch) return 60 * 60 * 1000;
    return Number(minutesMatch[1]) * 60 * 1000;
  }

  private async generateFlexibleBlocks(context: any, request: OptimizeDayRequest) {
    const payload = {
      date: context.dateStr,
      dayOfWeek: context.dayName,
      goals: request.goals,
      skipClasses: request.skipClasses || [],
      preferredFreeTime: request.preferredFreeTime || null,
      dayWindow: request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
      sleepWindow: request.sleepWindow || null,
      sleepFixed: Boolean(sleepWindow),
      additionalPreferences: request.additionalPreferences || null,
      courses: context.courses.map((c: any) => ({
        id: c.course?.id,
        code: c.course?.code,
        name: c.course?.name,
        resourceCount: c.resourceCount,
      })),
      skills: context.skills.map((s: any) => ({
        id: s.skill?.id,
        name: s.skill?.name,
        status: s.status,
      })),
      upcomingAssignments: context.assignments.map((a: any) => ({
        id: a.id,
        title: a.title,
        courseCode: a.courseCode,
        courseName: a.courseName,
        dueDate: a.dueDate,
        priority: a.priority,
        status: a.status,
      })),
      upcomingEvaluations: context.evaluations.map((e: any) => ({
        id: e.id,
        title: e.title,
        courseCode: e.courseCode,
        courseName: e.courseName,
        date: e.date,
        type: e.type,
      })),
      fixedBlocks: context.fixedBlocks.map((b: FixedBlock) => ({
        title: b.title,
        type: b.type,
        startDateTime: b.startDateTime.toISOString(),
        endDateTime: b.endDateTime.toISOString(),
      })),
      freeSlots: context.freeSlots.map((s: any) => ({
        startDateTime: s.startDateTime.toISOString(),
        endDateTime: s.endDateTime.toISOString(),
      })),
    };

    const systemPrompt = `You are a scheduling engine. You must return ONLY valid JSON with the shape {"scheduleItems": [...]}.\n\nRules:\n- ONLY schedule flexible items inside the provided freeSlots.\n- If sleepFixed=false, you MUST include a \"Sleep\" block in scheduleItems based on user preferences.\n- If sleepFixed=true, do NOT include a sleep block (already fixed).\n- Do NOT include fixed blocks (classes, evaluations, events); those are already fixed.\n- Respect goals and preferences.\n- Try to keep the preferredFreeTime slot free or light.\n- Use 30-120 minute blocks where appropriate.\n- Avoid overlaps and keep within the same date window.\n- Use type \"assignment\" for assignment work blocks, \"custom\" for study, breaks, learning, personal goals.\n- Use linkedEntityId when referencing a specific assignment or skill.\n- Output ISO timestamps for startDateTime/endDateTime.\n- No markdown, no extra text.`;

    const userPrompt = `Context:\n${JSON.stringify(payload)}`;

    const result = await this.generateContentWithFallback({
      systemPrompt,
      userPrompt,
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = extractJson(text);
    const parsed = aiScheduleResponseSchema.parse(json);

    return parsed.scheduleItems;
  }

  async optimizeDay(userId: string, request: OptimizeDayRequest) {
    const inferredSleep = extractSleepWindowFromText(request.additionalPreferences);
    const sleepWindow = resolveSleepWindow(request.sleepWindow, inferredSleep);
    const dateStr = request.date || formatDate(new Date());
    const context = await this.getContext(userId, dateStr, {
      ...request,
      sleepWindow,
    });

    const flexibleItems = await this.generateFlexibleBlocks(context, {
      ...request,
      sleepWindow,
    });

    const [schedule] = await db
      .insert(schedules)
      .values({
        userId,
        name: request.scheduleName || `Optimized Day ${dateStr}`,
        description: request.additionalPreferences || null,
        isActive: false,
      })
      .returning();

    const fixedItems = context.fixedBlocks.map((block: FixedBlock) => ({
      scheduleId: schedule.id,
      userId,
      title: block.title,
      description: block.description || null,
      type: block.type,
      linkedEntityId: block.linkedEntityId || null,
      linkedEntityType: block.linkedEntityType || null,
      startDateTime: block.startDateTime,
      endDateTime: block.endDateTime,
      location: block.location || null,
    }));

    const aiItems = flexibleItems.map((item) => ({
      scheduleId: schedule.id,
      userId,
      title: item.title,
      description: item.description || null,
      type: item.type as any,
      linkedEntityId: item.linkedEntityId || null,
      linkedEntityType: item.linkedEntityType || null,
      startDateTime: new Date(item.startDateTime),
      endDateTime: new Date(item.endDateTime),
      location: item.location || null,
    }));

    const allItems = [...fixedItems, ...aiItems].sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime()
    );

    if (allItems.length > 0) {
      await db.insert(scheduleItems).values(allItems);
    }

    return { schedule, items: allItems };
  }

  async editSchedule(userId: string, request: EditScheduleRequest) {
    const sleepWindow = request.sleepWindow ? request.sleepWindow : undefined;
    const [schedule] = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.id, request.scheduleId), eq(schedules.userId, userId)))
      .limit(1);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const existingItems = await db
      .select()
      .from(scheduleItems)
      .where(eq(scheduleItems.scheduleId, request.scheduleId))
      .orderBy(scheduleItems.startDateTime);

    if (existingItems.length === 0) {
      throw new Error('Schedule has no items to edit');
    }

    const scheduleDate = formatDate(new Date(existingItems[0].startDateTime));
    const window = normalizeDayWindow(scheduleDate, request.dayWindow);
    const normalizedSleepWindow = sleepWindow ? normalizeSleepWindow(scheduleDate, window, sleepWindow) : null;

    const payload = {
      date: scheduleDate,
      goals: request.goals || [],
      skipClasses: request.skipClasses || [],
      preferredFreeTime: request.preferredFreeTime || null,
      dayWindow: request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
      sleepWindow: sleepWindow || null,
      sleepFixed: Boolean(sleepWindow),
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      sleepStart: normalizedSleepWindow?.start?.toISOString() || null,
      sleepEnd: normalizedSleepWindow?.end?.toISOString() || null,
      additionalPreferences: request.additionalPreferences || null,
      instruction: request.instruction,
      items: existingItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        type: item.type,
        startDateTime: new Date(item.startDateTime).toISOString(),
        endDateTime: new Date(item.endDateTime).toISOString(),
        linkedEntityId: item.linkedEntityId,
        linkedEntityType: item.linkedEntityType,
        location: item.location,
      })),
    };

    const systemPrompt = `You are editing a daily schedule. Return ONLY valid JSON with the shape {"scheduleItems": [...]}.\n\nRules:\n- Apply the user's instruction.\n- Keep class/evaluation/event items unless instruction explicitly removes or skips them.\n- If sleepFixed=true, keep the sleep block unless the instruction explicitly changes sleep.\n- If sleepFixed=false, you may add or adjust sleep based on instruction and preferences.\n- Avoid overlaps and keep within the same date window.\n- Output ISO timestamps for startDateTime/endDateTime.\n- No markdown, no extra text.`;

    const userPrompt = `Context:\n${JSON.stringify(payload)}`;

    const result = await this.generateContentWithFallback({
      systemPrompt,
      userPrompt,
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const json = extractJson(text);
    const parsed = aiScheduleResponseSchema.parse(json);

    await db.delete(scheduleItems).where(eq(scheduleItems.scheduleId, request.scheduleId));

    const itemsToInsert = parsed.scheduleItems.map((item) => ({
      scheduleId: schedule.id,
      userId,
      title: item.title,
      description: item.description || null,
      type: item.type as any,
      linkedEntityId: item.linkedEntityId || null,
      linkedEntityType: item.linkedEntityType || null,
      startDateTime: new Date(item.startDateTime),
      endDateTime: new Date(item.endDateTime),
      location: item.location || null,
    }));

    if (itemsToInsert.length > 0) {
      await db.insert(scheduleItems).values(itemsToInsert);
    }

    await db
      .update(schedules)
      .set({ updatedAt: new Date() })
      .where(eq(schedules.id, request.scheduleId));

    return { schedule, items: itemsToInsert };
  }
}

export const smartScheduleService = new SmartScheduleService();

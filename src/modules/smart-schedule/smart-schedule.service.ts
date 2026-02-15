import { GoogleGenAI } from '@google/genai';
import { and, eq, gte, lte, or, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { schedules, scheduleItems, studentAssignments, studentEvaluations, campusEvents } from '../student-profile/student-profile.schema';
import { academicsService } from '../academics/academics.service';
import { sectionsService } from '../academics/sections.service';
import { skillsInterestsService } from '../skills-interests/skills-interests.service';
import type { OptimizeDayRequest, EditScheduleRequest } from './smart-schedule.schema';
import { aiScheduleResponseSchema } from './smart-schedule.schema';

const DEFAULT_DAY_START = '06:00';
const DEFAULT_DAY_END = '23:00';
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

type FixedBlock = {
  title: string;
  description?: string | null;
  type: 'class' | 'evaluation' | 'event' | 'custom';
  startDateTime: Date;
  endDateTime: Date;
  linkedEntityId?: string | null;
  linkedEntityType?: string | null;
  location?: string | null;
  color?: string | null;
};

function parseDateParts(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function getZonedOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const y = Number(lookup('year'));
  const m = Number(lookup('month'));
  const d = Number(lookup('day'));
  const h = Number(lookup('hour'));
  const min = Number(lookup('minute'));
  const s = Number(lookup('second'));
  const asUtc = Date.UTC(y, m - 1, d, h, min, s, 0);
  return (asUtc - date.getTime()) / (60 * 1000);
}

function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const { year, month, day } = parseDateParts(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guessDate = new Date(utcGuess);
  const offsetMinutes = getZonedOffsetMinutes(guessDate, timeZone);
  const corrected = utcGuess - offsetMinutes * 60 * 1000;
  return new Date(corrected);
}

function toDateTime(dateStr: string, timeStr: string, addDay: boolean = false): Date {
  const base = zonedTimeToUtc(dateStr, timeStr, DEFAULT_TIMEZONE);
  if (addDay) {
    base.setUTCDate(base.getUTCDate() + 1);
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
  const { year, month, day } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: DEFAULT_TIMEZONE });
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

function getItemColor(type: string, title?: string | null) {
  const palette: Record<string, string> = {
    class: '#2563EB', // blue
    lesson: '#2563EB',
    tutorial: '#06B6D4', // cyan
    lab: '#7C3AED', // purple
    evaluation: '#EF4444', // red
    event: '#F97316', // orange
    assignment: '#F59E0B', // amber
    break: '#22C55E', // green
    sleep: '#64748B', // slate
    custom: '#22C55E',
  };

  const lowerTitle = (title || '').toLowerCase();
  if (lowerTitle.includes('break')) return palette.break;
  if (lowerTitle.includes('sleep')) return palette.sleep;
  if (lowerTitle.includes('tutorial')) return palette.tutorial;
  if (lowerTitle.includes('lab')) return palette.lab;
  if (lowerTitle.includes('lecture') || lowerTitle.includes('class') || lowerTitle.includes('lesson')) return palette.class;

  return palette[type] || palette.custom;
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

  private isTimeoutError(error: any) {
    return error?.name === 'TimeoutError' || String(error?.message || '').toLowerCase().includes('timed out');
  }

  private async generateContentWithFallback(payload: {
    systemPrompt: string;
    userPrompt: string;
    thinkingBudget?: number;
  }) {
    const ai = this.buildAiClient();
    const primaryModel = this.getModelName();
    const fallbackModel = this.getFallbackModelName();
    const aiTimeoutMs = Number(process.env.SMART_SCHEDULE_AI_TIMEOUT_MS || 45000);
    const thinkingBudget = payload.thinkingBudget ?? 0;
    const run = async (model: string) => {
      const withThinking = ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: payload.userPrompt }] }],
        config: {
          systemInstruction: { parts: [{ text: payload.systemPrompt }] },
          temperature: 0.2,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget,
          },
        },
      });
      try {
        return await Promise.race([
          withThinking,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`AI timeout after ${aiTimeoutMs}ms`)), aiTimeoutMs)),
        ]);
      } catch (error: any) {
        const msg = String(error?.message || '');
        if (!msg.toLowerCase().includes('thinking')) throw error;
        const withoutThinking = ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: payload.userPrompt }] }],
          config: {
            systemInstruction: { parts: [{ text: payload.systemPrompt }] },
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });
        return await Promise.race([
          withoutThinking,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`AI timeout after ${aiTimeoutMs}ms`)), aiTimeoutMs)),
        ]);
      }
    };

    try {
      return await run(primaryModel);
    } catch (error: any) {
      if ((this.isModelNotFound(error) || this.isTimeoutError(error)) && fallbackModel !== primaryModel) {
        console.warn('[SmartSchedule] Primary model not found, falling back:', primaryModel, '->', fallbackModel);
        return await run(fallbackModel);
      }
      throw error;
    }
  }

  private async getContext(userId: string, dateStr: string, request: OptimizeDayRequest) {
    const t0 = Date.now();
    const window = normalizeDayWindow(dateStr, request.dayWindow);
    const sleepWindow = request.sleepWindow ? normalizeSleepWindow(dateStr, window, request.sleepWindow) : null;
    const dayStart = window.start;
    const dayEnd = window.end;
    const dayName = dayOfWeek(dateStr);

    const tFetch = Date.now();
    const [courses, skills, classSchedule, upcomingAssignments, upcomingEvaluations, events] = await Promise.all([
      academicsService.getUserCoursesWithResources(userId),
      skillsInterestsService.getUserSkills(userId),
      sectionsService.getUserSchedule(userId),
      db
        .select()
        .from(studentAssignments)
        .where(
          and(
            eq(studentAssignments.userId, userId),
            gte(studentAssignments.dueDate, new Date(dateStr + 'T00:00:00'))
          )
        )
        .orderBy(studentAssignments.dueDate)
        .limit(10),
      db
        .select()
        .from(studentEvaluations)
        .where(
          and(
            eq(studentEvaluations.userId, userId),
            gte(studentEvaluations.date, new Date(dateStr + 'T00:00:00'))
          )
        )
        .orderBy(studentEvaluations.date)
        .limit(10),
      db
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
        .orderBy(campusEvents.date)
        .limit(10),
    ]);
    console.log(`[SmartSchedule] Context fetches in ${Date.now() - tFetch}ms`);

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
          color: getItemColor('class', entry.sectionType),
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
          color: getItemColor('evaluation', evaluation.title),
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
        color: getItemColor('event', event.title),
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
        color: getItemColor('sleep', 'Sleep'),
      });
    }

    const freeSlots = computeFreeSlots(dayStart, dayEnd, fixedBlocks);

    console.log(`[SmartSchedule] Context built in ${Date.now() - t0}ms (fixedBlocks=${fixedBlocks.length}, freeSlots=${freeSlots.length})`);
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
    const sleepFixed = Boolean(request.sleepWindow);
    const payload = {
      date: context.dateStr,
      dayOfWeek: context.dayName,
      goals: request.goals,
      skipClasses: request.skipClasses || [],
      preferredFreeTime: request.preferredFreeTime || null,
      dayWindow: request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
      sleepWindow: request.sleepWindow || null,
      sleepFixed,
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
      freeMinutes: context.freeSlots.reduce((sum: number, s: any) => {
        return sum + Math.max(0, Math.floor((new Date(s.endDateTime).getTime() - new Date(s.startDateTime).getTime()) / 60000));
      }, 0),
    };

    const systemPrompt = `You are a scheduling engine. Return ONLY strict JSON: {"scheduleItems":[...]}.
Rules:
- Schedule ONLY inside freeSlots.
- Do NOT return fixed blocks (classes/evaluations/events).
- If there is very little free time, return fewer items (possibly 1).
- If sleepFixed=false, include Sleep only if it fits naturally; do not force impossible overlap.
- Prefer concise blocks and zero overlaps.
- Types allowed: assignment, custom, evaluation, event, class.
- Use linkedEntityId for assignment/skill blocks when relevant.
- Output ISO timestamps.
- No markdown, no prose.`;

    const userPrompt = `Context:\n${JSON.stringify(payload)}`;
    console.log(`[SmartSchedule] AI payload chars=${userPrompt.length}`);

    const tAi = Date.now();
    const parseResult = (result: any) => {
      const text = result?.text?.trim() || result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const json = extractJson(text);
      return aiScheduleResponseSchema.parse(json).scheduleItems;
    };

    try {
      const result = await this.generateContentWithFallback({
        systemPrompt,
        userPrompt,
        thinkingBudget: 0,
      });
      console.log(`[SmartSchedule] AI generation in ${Date.now() - tAi}ms`);
      return parseResult(result);
    } catch (error: any) {
      console.warn('[SmartSchedule] First AI parse/generation failed, retrying with compact prompt:', error?.message || error);
      const compactPayload = {
        date: context.dateStr,
        goals: request.goals,
        dayWindow: request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
        sleepWindow: request.sleepWindow || null,
        freeSlots: context.freeSlots.map((s: any) => ({
          startDateTime: s.startDateTime.toISOString(),
          endDateTime: s.endDateTime.toISOString(),
        })),
        topAssignments: context.assignments.slice(0, 2).map((a: any) => ({
          id: a.id,
          title: a.title,
          dueDate: a.dueDate,
          priority: a.priority,
        })),
      };
      const retrySystemPrompt = `Return ONLY valid JSON {"scheduleItems":[...]} with no extra text. If no feasible slot, return {"scheduleItems":[]} exactly.`;
      const retryUserPrompt = `Context:\n${JSON.stringify(compactPayload)}`;
      const retryResult = await this.generateContentWithFallback({
        systemPrompt: retrySystemPrompt,
        userPrompt: retryUserPrompt,
        thinkingBudget: 0,
      });
      console.log(`[SmartSchedule] AI retry generation in ${Date.now() - tAi}ms`);
      return parseResult(retryResult);
    }
  }

  async optimizeDay(userId: string, request: OptimizeDayRequest) {
    const t0 = Date.now();
    const sleepWindow = request.sleepWindow;
    const dateStr = request.date || formatDate(new Date());
    const context = await this.getContext(userId, dateStr, {
      ...request,
      sleepWindow,
    });

    const flexibleItems = await this.generateFlexibleBlocks(context, {
      ...request,
      sleepWindow,
    });
    console.log(`[SmartSchedule] Flexible items generated in ${Date.now() - t0}ms`);

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await db
      .update(schedules)
      .set({ isActive: false })
      .where(eq(schedules.userId, userId));

    const [schedule] = await db
      .insert(schedules)
      .values({
        userId,
        name: request.scheduleName || `Optimized Day ${dateStr}`,
        description: request.additionalPreferences || null,
        isActive: true,
        expiresAt,
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
      color: block.color || getItemColor(block.type, block.title),
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
      color: getItemColor(item.type, item.title),
    }));

    const [activeSchedule] = await db
      .select()
      .from(schedules)
      .where(and(eq(schedules.userId, userId), eq(schedules.isActive, true)))
      .orderBy(desc(schedules.createdAt))
      .limit(1);

    let carryOverItems: any[] = [];
    if (activeSchedule) {
      const existingItems = await db
        .select()
        .from(scheduleItems)
        .where(eq(scheduleItems.scheduleId, activeSchedule.id));

      const window = normalizeDayWindow(dateStr, request.dayWindow);
      carryOverItems = existingItems
        .filter((item) => {
          const start = new Date(item.startDateTime);
          return start < window.start || start >= window.end;
        })
        .map((item) => ({
          scheduleId: schedule.id,
          userId,
          title: item.title,
          description: item.description,
          type: item.type,
          linkedEntityId: item.linkedEntityId,
          linkedEntityType: item.linkedEntityType,
          startDateTime: item.startDateTime,
          endDateTime: item.endDateTime,
          isRecurring: item.isRecurring,
          recurrencePattern: item.recurrencePattern,
          recurrenceEndDate: item.recurrenceEndDate,
          dayOfWeek: item.dayOfWeek,
          location: item.location,
          color: item.color,
        }));
    }

    const allItems = [...carryOverItems, ...fixedItems, ...aiItems].sort(
      (a, b) => a.startDateTime.getTime() - b.startDateTime.getTime()
    );

    if (allItems.length > 0) {
      await db.insert(scheduleItems).values(allItems);
    }

    return {
      schedule,
      items: allItems,
      expiresAt,
      expiresInHours: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))),
    };
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

import { GoogleGenAI } from '@google/genai';
import { and, eq, gte, lte, or, desc } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { schedules, scheduleItems, studentAssignments, studentEvaluations, campusEvents } from '../student-profile/student-profile.schema';
import { academicsService } from '../academics/academics.service';
import { sectionsService } from '../academics/sections.service';
import { skillsInterestsService } from '../skills-interests/skills-interests.service';
import type { OptimizeDayRequest, EditScheduleRequest } from './smart-schedule.schema';
import { aiScheduleResponseSchema } from './smart-schedule.schema';
import { parseUtcIsoInput } from '../../core/utils/datetime';

const DEFAULT_DAY_START = '06:00';
const DEFAULT_DAY_END = '23:00';
const PREFERENCE_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

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

type AiCandidate = {
  title: string;
  description?: string | null;
  type: 'custom' | 'assignment' | 'evaluation' | 'event' | 'class';
  startDateTime: Date;
  endDateTime: Date;
  linkedEntityId?: string | null;
  linkedEntityType?: string | null;
  location?: string | null;
};

type GoalTarget = {
  title: string;
  type: 'custom' | 'assignment';
  linkedEntityId?: string | null;
  linkedEntityType?: string | null;
};

function parseDateParts(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function utcTimeOnDate(dateStr: string, timeStr: string): Date {
  const { year, month, day } = parseDateParts(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
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

function localWallTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const { year, month, day } = parseDateParts(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const guessDate = new Date(utcGuess);
  const offsetMinutes = getZonedOffsetMinutes(guessDate, timeZone);
  return new Date(utcGuess - offsetMinutes * 60 * 1000);
}

function toDateTime(dateStr: string, timeStr: string, addDay: boolean = false): Date {
  const base = utcTimeOnDate(dateStr, timeStr);
  if (addDay) {
    base.setUTCDate(base.getUTCDate() + 1);
  }
  return base;
}

function isClockTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function parseWindowPoint(dateStr: string, value: string): Date {
  if (isClockTime(value)) {
    return toDateTime(dateStr, value);
  }
  return parseUtcIsoInput(value);
}

function normalizeDayWindow(dateStr: string, window?: { start: string; end: string }) {
  const startTime = window?.start || DEFAULT_DAY_START;
  const endTime = window?.end || DEFAULT_DAY_END;
  const start = parseWindowPoint(dateStr, startTime);
  const endRaw = parseWindowPoint(dateStr, endTime);
  // If end time is earlier than start, it means sleep crosses midnight.
  const end = endRaw <= start
    ? (isClockTime(endTime) ? toDateTime(dateStr, endTime, true) : new Date(endRaw.getTime() + 24 * 60 * 60 * 1000))
    : endRaw;
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

  const start = parseWindowPoint(dateStr, sleepWindow.start);
  let end = parseWindowPoint(dateStr, sleepWindow.end);
  if (end <= start) {
    end = isClockTime(sleepWindow.end)
      ? toDateTime(dateStr, sleepWindow.end, true)
      : new Date(end.getTime() + 24 * 60 * 60 * 1000);
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
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: PREFERENCE_TIMEZONE });
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

function splitSlot(
  slots: Array<{ startDateTime: Date; endDateTime: Date }>,
  usedStart: Date,
  usedEnd: Date
) {
  const next: Array<{ startDateTime: Date; endDateTime: Date }> = [];
  for (const slot of slots) {
    if (usedEnd <= slot.startDateTime || usedStart >= slot.endDateTime) {
      next.push(slot);
      continue;
    }
    if (usedStart > slot.startDateTime) {
      next.push({ startDateTime: slot.startDateTime, endDateTime: new Date(usedStart) });
    }
    if (usedEnd < slot.endDateTime) {
      next.push({ startDateTime: new Date(usedEnd), endDateTime: slot.endDateTime });
    }
  }
  return next.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
}

function normalizeAiCandidates(
  raw: Array<{
    title: string;
    description?: string;
    type: 'custom' | 'assignment' | 'evaluation' | 'event' | 'class';
    startDateTime: string;
    endDateTime: string;
    linkedEntityId?: string | null;
    linkedEntityType?: string | null;
    location?: string | null;
  }>,
  dayStart: Date,
  dayEnd: Date
): AiCandidate[] {
  const out: AiCandidate[] = [];
  for (const item of raw) {
    const start = new Date(item.startDateTime);
    const end = new Date(item.endDateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end <= start) continue;

    const clippedStart = start < dayStart ? new Date(dayStart) : start;
    const clippedEnd = end > dayEnd ? new Date(dayEnd) : end;
    if (clippedEnd <= clippedStart) continue;

    out.push({
      title: item.title,
      description: item.description || null,
      type: item.type,
      startDateTime: clippedStart,
      endDateTime: clippedEnd,
      linkedEntityId: item.linkedEntityId || null,
      linkedEntityType: item.linkedEntityType || null,
      location: item.location || null,
    });
  }
  return out;
}

function normalizeClassCandidates(
  raw: Array<{
    title: string;
    description?: string;
    type: 'custom' | 'assignment' | 'evaluation' | 'event' | 'class';
    startDateTime: string;
    endDateTime: string;
    linkedEntityId?: string | null;
    linkedEntityType?: string | null;
    location?: string | null;
  }>,
  dayStart: Date,
  dayEnd: Date
): AiCandidate[] {
  return normalizeAiCandidates(raw, dayStart, dayEnd).filter((item) =>
    item.type === 'class' || item.linkedEntityType === 'section'
  );
}

function fitAiCandidatesIntoFreeSlots(
  candidates: AiCandidate[],
  freeSlots: Array<{ startDateTime: Date; endDateTime: Date }>
) {
  const placed: AiCandidate[] = [];
  let available = [...freeSlots].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

  for (const item of candidates.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())) {
    const durationMs = Math.max(15 * 60 * 1000, item.endDateTime.getTime() - item.startDateTime.getTime());
    let chosenStart: Date | null = null;
    let chosenEnd: Date | null = null;

    for (const slot of available) {
      const slotStart = slot.startDateTime;
      const slotEnd = slot.endDateTime;
      const start = item.startDateTime > slotStart ? new Date(item.startDateTime) : new Date(slotStart);
      const end = new Date(start.getTime() + durationMs);
      if (end <= slotEnd) {
        chosenStart = start;
        chosenEnd = end;
        break;
      }
    }

    if (!chosenStart || !chosenEnd) continue;

    placed.push({
      ...item,
      startDateTime: chosenStart,
      endDateTime: chosenEnd,
    });
    available = splitSlot(available, chosenStart, chosenEnd);
  }

  return placed.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
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

function addTwoHoursToWindowEnd(dayWindow?: { start: string; end: string }) {
  if (!dayWindow) {
    return { start: DEFAULT_DAY_START, end: '01:00' };
  }

  const end = dayWindow.end;
  if (isClockTime(end)) {
    const [h, m] = end.split(':').map(Number);
    const total = (h * 60 + m + 120) % (24 * 60);
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return { ...dayWindow, end: `${hh}:${mm}` };
  }

  const d = parseUtcIsoInput(end);
  d.setUTCHours(d.getUTCHours() + 2);
  return { ...dayWindow, end: d.toISOString() };
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function parse12HourTo24(input: string) {
  const match = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const ap = match[3];
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (ap === 'am') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parsePreferenceFixedBlocks(
  additionalPreferences: string | undefined,
  dateStr: string
): FixedBlock[] {
  if (!additionalPreferences) return [];
  const lines = additionalPreferences
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: FixedBlock[] = [];
  for (const line of lines) {
    const m = line.match(/^(.*?)\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (!m) continue;

    const rawTitle = (m[1] || '')
      .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
      .replace(/^(i\s+(want|will|need)\s+to\s+)/i, '')
      .trim();
    const startLocal = parse12HourTo24(m[2]);
    const endLocal = parse12HourTo24(m[3]);
    if (!startLocal || !endLocal) continue;

    const start = localWallTimeToUtc(dateStr, startLocal, PREFERENCE_TIMEZONE);
    let end = localWallTimeToUtc(dateStr, endLocal, PREFERENCE_TIMEZONE);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    const title = rawTitle ? rawTitle.replace(/\s+/g, ' ').replace(/\.$/, '') : 'Preference Block';
    const prettyTitle = title
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');

    blocks.push({
      title: prettyTitle,
      description: 'User preference',
      type: 'custom',
      startDateTime: start,
      endDateTime: end,
      linkedEntityType: 'preference_lock',
      color: getItemColor('custom', prettyTitle),
    });
  }
  return blocks;
}

function slotDurationMinutes(slot: { startDateTime: Date; endDateTime: Date }) {
  return Math.max(0, Math.floor((slot.endDateTime.getTime() - slot.startDateTime.getTime()) / 60000));
}

function fillMissingTargets(
  placed: AiCandidate[],
  freeSlots: Array<{ startDateTime: Date; endDateTime: Date }>,
  targets: GoalTarget[]
) {
  const covered = new Set(
    placed
      .map((p) => p.linkedEntityId || p.title.toLowerCase())
      .filter(Boolean)
  );

  let available = [...freeSlots].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
  const added: AiCandidate[] = [];

  const allocate = (target: GoalTarget, preferredMinutes: number) => {
    for (const slot of available) {
      const freeMins = slotDurationMinutes(slot);
      if (freeMins < 20) continue;
      const useMins = Math.min(preferredMinutes, freeMins);
      if (useMins < 20) continue;
      const start = new Date(slot.startDateTime);
      const end = new Date(start.getTime() + useMins * 60 * 1000);
      added.push({
        title: target.title,
        description: null,
        type: target.type,
        linkedEntityId: target.linkedEntityId || null,
        linkedEntityType: target.linkedEntityType || null,
        startDateTime: start,
        endDateTime: end,
        location: null,
      });
      available = splitSlot(available, start, end);
      return true;
    }
    return false;
  };

  for (const target of targets) {
    const key = target.linkedEntityId || target.title.toLowerCase();
    if (covered.has(key)) continue;
    const ok = allocate(target, 60);
    if (ok) covered.add(key);
  }

  // Use remaining space with round-robin reinforcement blocks.
  let guard = 0;
  while (available.some((s) => slotDurationMinutes(s) >= 30) && targets.length > 0 && guard < 50) {
    const idx = guard % targets.length;
    allocate(targets[idx], 45);
    guard++;
  }

  return [...placed, ...added].sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
}

function daysUntil(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
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
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  }) {
    const ai = this.buildAiClient();
    const primaryModel = this.getModelName();
    const fallbackModel = this.getFallbackModelName();
    const aiTimeoutMs = Number(process.env.SMART_SCHEDULE_AI_TIMEOUT_MS || 45000);
    const thinkingLevel = payload.thinkingLevel || 'medium';
    const run = async (model: string) => {
      const supportsThinkingLevel = model.includes('gemini-3');
      const withThinking = ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: payload.userPrompt }] }],
        config: {
          systemInstruction: { parts: [{ text: payload.systemPrompt }] },
          temperature: 0.2,
          responseMimeType: 'application/json',
          ...(supportsThinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
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

    const classFixedBlocks: FixedBlock[] = [];
    const anchoredFixedBlocks: FixedBlock[] = [];

    for (const entry of classSchedule) {
      for (const timing of entry.schedule) {
        if (timing.dayOfWeek !== dayName) continue;
        const sectionType = (entry.sectionType || '').toLowerCase();
        if (sectionType.includes('lecture') && skipMap.lecture) continue;
        if (sectionType.includes('tutorial') && skipMap.tutorial) continue;
        if (sectionType.includes('lab') && skipMap.lab) continue;

        const classStart = localWallTimeToUtc(dateStr, timing.startTime, PREFERENCE_TIMEZONE);
        const classEnd = localWallTimeToUtc(dateStr, timing.endTime, PREFERENCE_TIMEZONE);
        if (!overlaps(classStart, classEnd, dayStart, dayEnd)) continue;

        classFixedBlocks.push({
          title: `${entry.courseCode} ${entry.sectionType} ${entry.sectionNumber}`,
          description: entry.courseName,
          type: 'class',
          startDateTime: classStart < dayStart ? new Date(dayStart) : classStart,
          endDateTime: classEnd > dayEnd ? new Date(dayEnd) : classEnd,
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
        anchoredFixedBlocks.push({
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
      anchoredFixedBlocks.push({
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

    const preferenceBlocks = parsePreferenceFixedBlocks(request.additionalPreferences, dateStr)
      .filter((b) => overlaps(b.startDateTime, b.endDateTime, dayStart, dayEnd))
      .map((b) => ({
        ...b,
        startDateTime: b.startDateTime < dayStart ? new Date(dayStart) : b.startDateTime,
        endDateTime: b.endDateTime > dayEnd ? new Date(dayEnd) : b.endDateTime,
      }))
      .filter((b) => b.endDateTime > b.startDateTime);
    anchoredFixedBlocks.push(...preferenceBlocks);

    const fixedBlocks: FixedBlock[] = [...classFixedBlocks, ...anchoredFixedBlocks];

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
      classFixedBlocks,
      anchoredFixedBlocks,
      preferenceBlocks,
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
      preferenceTimezone: PREFERENCE_TIMEZONE,
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
      classBlocks: context.classFixedBlocks.map((b: FixedBlock) => ({
        title: b.title,
        description: b.description || null,
        type: b.type,
        linkedEntityId: b.linkedEntityId || null,
        linkedEntityType: b.linkedEntityType || null,
        startDateTime: b.startDateTime.toISOString(),
        endDateTime: b.endDateTime.toISOString(),
        location: b.location || null,
      })),
      anchoredBlocks: context.anchoredFixedBlocks.map((b: FixedBlock) => ({
        title: b.title,
        description: b.description || null,
        type: b.type,
        linkedEntityId: b.linkedEntityId || null,
        linkedEntityType: b.linkedEntityType || null,
        startDateTime: b.startDateTime.toISOString(),
        endDateTime: b.endDateTime.toISOString(),
        location: b.location || null,
      })),
      freeSlots: context.freeSlots.map((s: any) => ({
        startDateTime: s.startDateTime.toISOString(),
        endDateTime: s.endDateTime.toISOString(),
      })),
      freeMinutes: context.freeSlots.reduce((sum: number, s: any) => {
        return sum + Math.max(0, Math.floor((new Date(s.endDateTime).getTime() - new Date(s.startDateTime).getTime()) / 60000));
      }, 0),
    };

    const systemPrompt = `You are an expert schedule optimizer. Return ONLY strict JSON: {"scheduleItems":[...]}.

MISSION:
- Produce the best possible day plan in one pass.
- Maximize meaningful use of available time in freeSlots.
- Cover selected academics + selected skills whenever possible.
- If freeSlots span across midnight, use those cross-day slots too.

HARD CONSTRAINTS (never violate):
- Schedule ONLY inside dayWindow.
- Non-class fixed blocks (evaluations/events/sleep/preference locks) must be kept as-is.
- Class blocks are editable: you may keep/omit/reorder class/tutorial/lab blocks based on skipClasses and additionalPreferences (e.g., skipping specific courses or particular lessons).
- No overlaps between returned scheduleItems.
- dayWindow/freeSlots/fixedBlocks are UTC timestamps; respect exactly.
- Output valid ISO UTC timestamps for startDateTime/endDateTime.
- endDateTime must be strictly after startDateTime.
- Minimum useful block length: 20 minutes.
- Types allowed: assignment, custom, evaluation, event, class.
- No markdown, no explanation, no extra keys, no prose.

PREFERENCE TIME INTERPRETATION:
- If additionalPreferences contains time phrases (e.g. "9-10pm", "8:30 to 9pm"), interpret those phrases in local timezone ${PREFERENCE_TIMEZONE}, then convert to UTC output times.
- Backend will not parse preference text. You must handle it.

QUALITY TARGETS:
- Use as much feasible free time as possible (target >=85% utilization unless free time is too fragmented).
- Include at least one block for each selected course when feasible.
- Include at least one block for each selected skill when feasible.
- Prioritize urgent items with these thresholds only:
  - Assignments are urgent only if due within 1 day.
  - Evaluations are urgent only if within 3 days.
- If not urgent by the above thresholds, do NOT let assignments/evaluations dominate selected courses/skills or user preferences.
- Split long free periods into focused blocks (typically 30-90 min) with short breaks when helpful.

PLANNING METHOD (apply internally before output):
1) Decide class/tutorial/lab inclusions first (respect explicit skip requests).
2) Treat non-class fixed blocks as immovable.
3) Place urgent academic tasks next.
4) Place selected course blocks ensuring coverage.
5) Place selected skill blocks ensuring coverage.
6) Fill remaining gaps with useful study/practice/revision blocks.
7) Validate final schedule: inside dayWindow, no overlaps, high utilization.

Output format exactly:
{"scheduleItems":[{"title":"...","description":"...","type":"custom","startDateTime":"...","endDateTime":"...","linkedEntityId":null,"linkedEntityType":null,"location":null}]}`;

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
        thinkingLevel: 'medium',
      });
      console.log(`[SmartSchedule] AI generation in ${Date.now() - tAi}ms`);
      return parseResult(result);
    } catch (error: any) {
      console.warn('[SmartSchedule] First AI parse/generation failed, retrying with compact prompt:', error?.message || error);
      const compactPayload = {
        date: context.dateStr,
        preferenceTimezone: PREFERENCE_TIMEZONE,
        goals: request.goals,
        dayWindow: request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
        sleepWindow: request.sleepWindow || null,
        additionalPreferences: request.additionalPreferences || null,
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
      const retrySystemPrompt = `Return ONLY valid JSON {"scheduleItems":[...]} with no extra text.
Hard rules:
- Use only freeSlots; never overlap.
- UTC timestamps only.
- Prefer high utilization and include selected course/skill coverage when feasible.
- Treat time phrases in additionalPreferences as local timezone ${PREFERENCE_TIMEZONE}, convert to UTC.
If impossible, return {"scheduleItems":[]} exactly.`;
      const retryUserPrompt = `Context:\n${JSON.stringify(compactPayload)}`;
      const retryResult = await this.generateContentWithFallback({
        systemPrompt: retrySystemPrompt,
        userPrompt: retryUserPrompt,
        thinkingLevel: 'medium',
      });
      console.log(`[SmartSchedule] AI retry generation in ${Date.now() - tAi}ms`);
      return parseResult(retryResult);
    }
  }

  async optimizeDay(userId: string, request: OptimizeDayRequest) {
    const t0 = Date.now();
    const sleepWindow = request.sleepWindow;
    const dateStr = request.date || formatDate(new Date());

    const runOptimization = async (effectiveRequest: OptimizeDayRequest) => {
      const context = await this.getContext(userId, dateStr, {
        ...effectiveRequest,
        sleepWindow,
      });
      const aiItemsRaw = await this.generateFlexibleBlocks(context, {
        ...effectiveRequest,
        sleepWindow,
      });

      const aiClassCandidates = normalizeClassCandidates(aiItemsRaw, context.dayStart, context.dayEnd);
      const effectiveClassFixedBlocks: FixedBlock[] = aiClassCandidates.length > 0
        ? aiClassCandidates.map((c) => ({
            title: c.title,
            description: c.description || null,
            type: 'class',
            startDateTime: c.startDateTime,
            endDateTime: c.endDateTime,
            linkedEntityId: c.linkedEntityId || null,
            linkedEntityType: c.linkedEntityType || 'section',
            location: c.location || null,
            color: getItemColor('class', c.title),
          }))
        : context.classFixedBlocks;

      const activeFixedBlocks = [...context.anchoredFixedBlocks, ...effectiveClassFixedBlocks]
        .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
      const activeFreeSlots = computeFreeSlots(context.dayStart, context.dayEnd, activeFixedBlocks);
      const preferenceTitles = new Set(
        (context.preferenceBlocks || [])
          .map((b: any) => (b.title || '').toLowerCase().trim())
          .filter(Boolean)
      );

      const aiFlexibleRaw = aiItemsRaw.filter((item) => item.type !== 'class' && item.linkedEntityType !== 'section');
      const urgentAssignmentIds = new Set(
        (context.assignments || [])
          .filter((a: any) => daysUntil(context.dayStart, new Date(a.dueDate)) <= 1)
          .map((a: any) => a.id)
      );
      const hasUrgentEvaluations = (context.evaluations || []).some(
        (e: any) => daysUntil(context.dayStart, new Date(e.date)) <= 3
      );

      let candidates = normalizeAiCandidates(aiFlexibleRaw, context.dayStart, context.dayEnd);
      candidates = candidates.filter((c) => {
        const title = (c.title || '').toLowerCase().trim();
        if (title && Array.from(preferenceTitles).some((p) => p && (title.includes(p) || p.includes(title)))) {
          return false; // Avoid duplicating user locked preference activities.
        }
        if (c.type === 'assignment') {
          return c.linkedEntityId ? urgentAssignmentIds.has(c.linkedEntityId) : false;
        }
        if (c.type === 'evaluation') {
          return hasUrgentEvaluations;
        }
        return true;
      });
      let fitted = fitAiCandidatesIntoFreeSlots(candidates, activeFreeSlots);
      let remaining = [...activeFreeSlots];
      for (const p of fitted) {
        remaining = splitSlot(remaining, p.startDateTime, p.endDateTime);
      }

      const targets: GoalTarget[] = [];
      const wantsAcademics = (effectiveRequest.goals || []).includes('academics');
      const wantsSkills = (effectiveRequest.goals || []).includes('personal_goals') || (effectiveRequest.goals || []).includes('learn_new');

      const courseTargets: GoalTarget[] = wantsAcademics
        ? context.courses.map((c: any) => {
            const course = c.course || {};
            return {
              title: `Study ${course.name || course.code || 'Course'}${course.code ? ` (${course.code})` : ''}`.trim(),
              type: 'custom' as const,
              linkedEntityId: course.id || null,
              linkedEntityType: 'course',
            };
          })
        : [];

      const skillTargets: GoalTarget[] = wantsSkills
        ? context.skills.map((s: any) => {
            const skill = s.skill || {};
            return {
              title: `${skill.name || 'Skill'} Practice`,
              type: 'custom' as const,
              linkedEntityId: skill.id || null,
              linkedEntityType: 'skill',
            };
          })
        : [];

      // Interleave course+skill so personal goals do not get starved by academics.
      const maxLen = Math.max(courseTargets.length, skillTargets.length);
      for (let i = 0; i < maxLen; i++) {
        if (courseTargets[i]) targets.push(courseTargets[i]);
        if (skillTargets[i]) targets.push(skillTargets[i]);
      }

      const urgentAssignments = (context.assignments || [])
        .filter((a: any) => daysUntil(context.dayStart, new Date(a.dueDate)) <= 1)
        .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      if (urgentAssignments.length > 0) {
        const top = urgentAssignments[0];
        targets.unshift({
          title: `Work on ${top.title}${top.courseCode ? ` (${top.courseCode})` : ''}`,
          type: 'assignment',
          linkedEntityId: top.id,
          linkedEntityType: 'assignment',
        });
      }

      fitted = fillMissingTargets(fitted, remaining, targets);
      return { context, fitted, activeFixedBlocks };
    };

    let usedExtendedBuffer = false;
    let effectiveRequest: OptimizeDayRequest = { ...request };
    let { context, fitted, activeFixedBlocks } = await runOptimization(effectiveRequest);
    console.log(`[SmartSchedule] Flexible items generated in ${Date.now() - t0}ms (placed=${fitted.length})`);

    if (fitted.length === 0) {
      usedExtendedBuffer = true;
      effectiveRequest = {
        ...request,
        dayWindow: addTwoHoursToWindowEnd(request.dayWindow),
      };
      ({ context, fitted, activeFixedBlocks } = await runOptimization(effectiveRequest));
      console.log(`[SmartSchedule] Re-ran with +2h buffer (placed=${fitted.length})`);
    }

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

    const fixedItems = activeFixedBlocks.map((block: FixedBlock) => ({
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

    const aiItems = fitted.map((item) => ({
      scheduleId: schedule.id,
      userId,
      title: item.title,
      description: item.description || null,
      type: item.type as any,
      linkedEntityId: item.linkedEntityId || null,
      linkedEntityType: item.linkedEntityType || null,
      startDateTime: item.startDateTime,
      endDateTime: item.endDateTime,
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

      const window = normalizeDayWindow(dateStr, effectiveRequest.dayWindow);
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
      usedExtendedBuffer,
      effectiveDayWindow: effectiveRequest.dayWindow || request.dayWindow || { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END },
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

    const systemPrompt = `You are editing a daily schedule. Return ONLY valid JSON with the shape {"scheduleItems": [...]}.\n\nRules:\n- Apply the user's instruction.\n- Keep class/evaluation/event items unless instruction explicitly removes or skips them.\n- If sleepFixed=true, keep the sleep block unless the instruction explicitly changes sleep.\n- If sleepFixed=false, you may add or adjust sleep based on instruction and preferences.\n- Schedule window timestamps are UTC.\n- If instruction/additionalPreferences mentions human time phrases, interpret those phrases in local timezone ${PREFERENCE_TIMEZONE} and convert to UTC output timestamps.\n- Avoid overlaps and keep within the same date window.\n- Output ISO timestamps for startDateTime/endDateTime.\n- No markdown, no extra text.`;

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

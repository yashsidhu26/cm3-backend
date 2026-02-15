import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { GoogleGenAI } from '@google/genai';
import {
    studentProfiles,
    studentAcademics,
    studentExperiences,
    studentCommitments,
    activityLogs,
    studentAssignments,
    studentEvaluations,
    schedules,
    scheduleItems,
    campusEvents,
    type learningStyleEnum
} from './student-profile.schema';
import { user as userTable } from '../auth/auth.schema';

/**
 * Student Profile Service
 * Implements "Smart" features: Gap Analysis, Behavioral Analysis, Personalized Plans
 */

export class StudentProfileService {
    private aiTipsCache = new Map<string, { expiresAt: number; data: any }>();

    /**
     * Create or Update Profile Profile
     */
    async upsertProfile(userId: string, data: typeof studentProfiles.$inferInsert) {
        const existing = await db.query.studentProfiles.findFirst({
            where: eq(studentProfiles.userId, userId)
        });

        if (existing) {
            return await db.update(studentProfiles)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(studentProfiles.userId, userId))
                .returning();
        }
        return await db.insert(studentProfiles).values(data).returning();
    }

    /**
     * Upsert Academic Data
     */
    async upsertAcademics(userId: string, data: Partial<typeof studentAcademics.$inferInsert>) {
        const existing = await db.query.studentAcademics.findFirst({
            where: eq(studentAcademics.userId, userId)
        });

        if (existing) {
            return await db.update(studentAcademics)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(studentAcademics.userId, userId))
                .returning();
        }
        return await db.insert(studentAcademics).values({ ...data, userId } as any).returning();
    }

    /**
     * Gap Analysis Engine
     * Compares Interests vs Skills & Experiences
     */
    async runGapAnalysis(userId: string) {
        const academics = await db.query.studentAcademics.findFirst({
            where: eq(studentAcademics.userId, userId)
        });

        if (!academics || !academics.interests) return [];

        const experiences = await db.query.studentExperiences.findMany({
            where: eq(studentExperiences.userId, userId)
        });

        const interests = academics.interests as string[];
        const currentSkills = new Set(academics.skills as string[] || []);

        // Add skills from experiences
        experiences.forEach(exp => {
            const skills = exp.skillsUsed as string[] || [];
            skills.forEach(s => currentSkills.add(s));
        });

        const suggestions: { type: string; message: string; interest: string }[] = [];

        // Analyze gaps
        for (const interest of interests) {
            // Simple logic: If interested in X but don't have X as a skill match
            // In a real app, this would use semantic matching (e.g. "ML" matches "Python")
            // Here we look for direct match or "related" keywords

            const hasSkill = Array.from(currentSkills).some(skill =>
                skill.toLowerCase().includes(interest.toLowerCase()) ||
                interest.toLowerCase().includes(skill.toLowerCase())
            );

            if (!hasSkill) {
                suggestions.push({
                    type: 'course_recommendation',
                    message: `You are interested in ${interest} but haven't listed it as a skill yet. Consider taking a course!`,
                    interest
                });

                suggestions.push({
                    type: 'project_idea',
                    message: `Build a project using ${interest} to gain practical experience.`,
                    interest
                });
            }
        }

        return suggestions;
    }

    /**
     * Behavioral Pattern Analyzer
     * Analyzes activity logs for productivity
     */
    async analyzeBehavior(userId: string) {
        const logs = await db.query.activityLogs.findMany({
            where: eq(activityLogs.userId, userId),
            orderBy: [desc(activityLogs.completionTime)]
        });

        if (logs.length === 0) {
            return {
                completionRate: 0,
                peakProductivityWindow: "Unknown",
                procrastinationScore: 0
            };
        }

        // 1. Completion Rate
        const completed = logs.filter(l => l.status === 'completed').length;
        const completionRate = (completed / logs.length) * 100;

        // 2. Peak Productivity Window
        // Group completion times by hour
        const hourCounts: Record<number, number> = {};
        logs.filter(l => l.completionTime && l.status === 'completed').forEach(l => {
            const hour = new Date(l.completionTime!).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        let peakHour = -1;
        let maxTasks = 0;
        for (const [hour, count] of Object.entries(hourCounts)) {
            if (count > maxTasks) {
                maxTasks = count;
                peakHour = parseInt(hour);
            }
        }

        let window = "Variable";
        if (peakHour !== -1) {
            if (peakHour >= 5 && peakHour < 12) window = "Morning Person (5AM - 12PM)";
            else if (peakHour >= 12 && peakHour < 17) window = "Afternoon Worker (12PM - 5PM)";
            else if (peakHour >= 17 && peakHour < 22) window = "Evening Achiever (5PM - 10PM)";
            else window = "Night Owl (10PM - 5AM)";
        }

        return {
            completionRate,
            peakProductivityWindow: window,
            totalTasksLogged: logs.length
        };
    }

    /**
     * Smart Study Plan Service
     * Fetches mock plan and personalizes it
     */
    async getSmartStudyPlan(userId: string) {
        // Step A: Fetch Mock Plan
        const mockPlan = [
            { id: 1, subject: "Data Structures", task: "Review Trees", duration: 60, recommendedHour: 10 }, // 10 AM
            { id: 2, subject: "Algorithms", task: "Practice DP", duration: 90, recommendedHour: 14 }, // 2 PM
            { id: 3, subject: "System Design", task: "Read Chapter 5", duration: 45, recommendedHour: 19 }, // 7 PM
        ];

        // Step B: Run Analysis
        const behavior = await this.analyzeBehavior(userId);

        // Step C: Personalize
        // Logic: Shift tasks to match productivity window
        let shiftAmount = 0;

        if (behavior.peakProductivityWindow.includes("Morning")) shiftAmount = 0; // Default is mostly day
        else if (behavior.peakProductivityWindow.includes("Afternoon")) shiftAmount = 2; // Shift later
        else if (behavior.peakProductivityWindow.includes("Evening")) shiftAmount = 5; // Shift to evening
        else if (behavior.peakProductivityWindow.includes("Night")) shiftAmount = 8; // Shift to night

        const personalizedPlan = mockPlan.map(item => {
            let newHour = item.recommendedHour + shiftAmount;
            if (newHour > 23) newHour = newHour - 24;

            return {
                ...item,
                originalTime: `${item.recommendedHour}:00`,
                personalizedTime: `${newHour}:00`,
                reason: `Shifted to your ${behavior.peakProductivityWindow} window`
            };
        });

        return {
            source: "Legacy System + BHD Intelligence Engine",
            analysis: behavior,
            plan: personalizedPlan
        };
    }

    /**
     * Initial Dashboard Data Aggregation
     */
    async getDashboardData(userId: string) {
        const profile = await db.query.studentProfiles.findFirst({ where: eq(studentProfiles.userId, userId) });
        const academics = await db.query.studentAcademics.findFirst({ where: eq(studentAcademics.userId, userId) });
        const analysis = await this.analyzeBehavior(userId);
        const suggestions = await this.runGapAnalysis(userId);

        return {
            profile,
            academics,
            insights: {
                behavior: analysis,
                suggestions
            }
        };
    }

    /**
     * Get Focus Screen Data
     * All data needed for the frontend Focus screen
     */
    async getFocusScreenData(userId: string) {
        // Get user info
        const [user] = await db.select().from(userTable).where(eq(userTable.id, userId));

        // Get upcoming assignments (due in next 7 days)
        const timeZone = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
        const now = this.getZonedNow(timeZone);
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const assignments = await db.select()
            .from(studentAssignments)
            .where(
                and(
                    eq(studentAssignments.userId, userId),
                    gte(studentAssignments.dueDate, now)
                )
            )
            .orderBy(studentAssignments.dueDate)
            .limit(10);
        const pendingAssignments = assignments.filter(a => a.status !== 'completed' && a.status !== 'graded' && a.status !== 'submitted');

        // Get upcoming evaluations (next 30 days)
        const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const evaluations = await db.select()
            .from(studentEvaluations)
            .where(
                and(
                    eq(studentEvaluations.userId, userId),
                    gte(studentEvaluations.date, now)
                )
            )
            .orderBy(studentEvaluations.date)
            .limit(10);

        // Get what's up next from active schedule (next upcoming item, no matter how far)
        let whatsUpNext = null;
        let ongoingItem: any = null;
        let scheduledItems: Array<{ item: any; nextStart: Date; nextEnd: Date | null }> = [];
        let upcomingEvents: any[] = [];
        const [activeSchedule] = await db.select()
            .from(schedules)
            .where(
                and(
                    eq(schedules.userId, userId),
                    eq(schedules.isActive, true)
                )
            )
            .limit(1);

        if (activeSchedule) {
            const allItems = await db.select()
                .from(scheduleItems)
                .where(eq(scheduleItems.scheduleId, activeSchedule.id));

            scheduledItems = allItems
                .map(item => {
                    let nextStart: Date | null = null;
                    let nextEnd: Date | null = null;

                    if (item.isRecurring && item.recurrencePattern === 'weekly' && item.dayOfWeek) {
                        const nextOccurrence = this.calculateNextWeeklyOccurrence(
                            item.dayOfWeek,
                            item.startDateTime
                        );
                        const endTemplate = item.endDateTime || item.startDateTime;
                        const occurrenceEnd = new Date(nextOccurrence);
                        occurrenceEnd.setHours(endTemplate.getHours(), endTemplate.getMinutes(), 0, 0);

                        if (nextOccurrence <= now && occurrenceEnd >= now) {
                            nextStart = now;
                            nextEnd = occurrenceEnd;
                        } else {
                            nextStart = nextOccurrence;
                            nextEnd = occurrenceEnd;
                        }
                    } else {
                        const start = this.interpretAsZonedWallTime(item.startDateTime, timeZone);
                        let end = item.endDateTime
                            ? this.interpretAsZonedWallTime(item.endDateTime, timeZone)
                            : start;
                        if (end.getTime() === start.getTime()) {
                            end = new Date(start.getTime() + 60 * 60 * 1000);
                        }
                        if (end >= now) {
                            nextStart = start <= now ? now : start;
                            nextEnd = end;
                        }
                    }

                    if (!nextStart) return null;
                    return { item, nextStart, nextEnd };
                })
                .filter((entry): entry is { item: any; nextStart: Date; nextEnd: Date | null } => Boolean(entry));

            upcomingEvents = await db.select()
                .from(campusEvents)
                .where(
                    and(
                        eq(campusEvents.userId, userId),
                        eq(campusEvents.isEnrolled, true),
                        gte(campusEvents.date, now)
                    )
                )
                .orderBy(campusEvents.date)
                .limit(5);

            const eventCandidates = upcomingEvents.map(event => {
                const start = this.interpretAsZonedWallTime(event.date, timeZone);
                let end = event.endDate ? this.interpretAsZonedWallTime(event.endDate, timeZone) : start;
                if (end.getTime() === start.getTime()) {
                    end = new Date(start.getTime() + 60 * 60 * 1000);
                }
                return {
                    event,
                    nextStart: start,
                    nextEnd: end,
                };
            });

            const classCandidates = scheduledItems.filter(entry => entry.item.type === 'class');
            const nonClassCandidates = scheduledItems.filter(entry => entry.item.type !== 'class');

            const ongoingCandidates = scheduledItems.filter(entry => entry.nextStart <= now && (entry.nextEnd || entry.nextStart) >= now);
            const ongoingEventCandidates = eventCandidates.filter(entry => entry.nextStart <= now && (entry.nextEnd || entry.nextStart) >= now);

            if (ongoingCandidates.length > 0) {
                const active = ongoingCandidates.sort((a, b) => a.nextStart.getTime() - b.nextStart.getTime())[0];
                ongoingItem = {
                    id: active.item.id,
                    type: active.item.type,
                    title: active.item.title,
                    description: active.item.description,
                    startDateTime: active.nextStart.toISOString(),
                    endDateTime: active.nextEnd ? active.nextEnd.toISOString() : active.item.endDateTime?.toISOString(),
                    location: active.item.location,
                    linkedEntityType: active.item.linkedEntityType,
                    color: active.item.color,
                    isRecurring: active.item.isRecurring,
                    dayOfWeek: active.item.dayOfWeek,
                };
            } else if (ongoingEventCandidates.length > 0) {
                const activeEvent = ongoingEventCandidates.sort((a, b) => a.nextStart.getTime() - b.nextStart.getTime())[0];
                ongoingItem = {
                    id: activeEvent.event.id,
                    type: 'event',
                    title: activeEvent.event.title,
                    description: activeEvent.event.description,
                    startDateTime: activeEvent.nextStart.toISOString(),
                    endDateTime: activeEvent.nextEnd ? activeEvent.nextEnd.toISOString() : null,
                    location: activeEvent.event.location,
                    linkedEntityType: 'event',
                    color: null,
                    isRecurring: false,
                    dayOfWeek: null,
                };
            }

            const upcomingClasses = classCandidates.filter(entry => entry.nextStart > now);
            const upcomingNonClasses = nonClassCandidates.filter(entry => entry.nextStart > now);
            const upcomingEventsOnly = eventCandidates.filter(entry => entry.nextStart > now);

            const nextClass = upcomingClasses.sort((a, b) => a.nextStart.getTime() - b.nextStart.getTime())[0] || null;
            const nextEvent = upcomingEventsOnly.sort((a, b) => a.nextStart.getTime() - b.nextStart.getTime())[0] || null;
            const nextNonClass = upcomingNonClasses.sort((a, b) => a.nextStart.getTime() - b.nextStart.getTime())[0] || null;

            let pick = null;
            if (nextClass && nextEvent) {
                const classStart = nextClass.nextStart;
                const classEnd = nextClass.nextEnd || nextClass.nextStart;
                const eventStart = nextEvent.nextStart;
                const eventEnd = nextEvent.nextEnd || nextEvent.nextStart;

                const overlaps = classStart < eventEnd && classEnd > eventStart;
                if (overlaps) {
                    pick = { type: 'schedule', payload: nextClass };
                } else {
                    pick = classStart <= eventStart
                        ? { type: 'schedule', payload: nextClass }
                        : { type: 'event', payload: nextEvent };
                }
            } else if (nextClass) {
                pick = { type: 'schedule', payload: nextClass };
            } else if (nextEvent) {
                pick = { type: 'event', payload: nextEvent };
            } else if (nextNonClass) {
                pick = { type: 'schedule', payload: nextNonClass };
            }

            if (pick?.type === 'event') {
                const { event, nextStart, nextEnd } = pick.payload;
                whatsUpNext = {
                    id: event.id,
                    type: 'event',
                    title: event.title,
                    description: event.description,
                    startDateTime: nextStart.toISOString(),
                    endDateTime: nextEnd ? nextEnd.toISOString() : null,
                    startDateTimeLocal: this.toLocalIso(nextStart),
                    endDateTimeLocal: nextEnd ? this.toLocalIso(nextEnd) : null,
                    location: event.location,
                    linkedEntityType: 'event',
                    color: null,
                    isRecurring: false,
                    dayOfWeek: null,
                    timeUntil: this.calculateTimeUntil(nextStart, now),
                };
            } else if (pick?.type === 'schedule') {
                const { item, nextStart, nextEnd } = pick.payload;
                whatsUpNext = {
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    description: item.description,
                    startDateTime: nextStart.toISOString(),
                    endDateTime: nextEnd ? nextEnd.toISOString() : item.endDateTime?.toISOString(),
                    startDateTimeLocal: this.toLocalIso(nextStart),
                    endDateTimeLocal: nextEnd ? this.toLocalIso(nextEnd) : item.endDateTime ? this.toLocalIso(item.endDateTime) : null,
                    location: item.location,
                    linkedEntityType: item.linkedEntityType,
                    color: item.color,
                    isRecurring: item.isRecurring,
                    dayOfWeek: item.dayOfWeek,
                    timeUntil: this.calculateTimeUntil(nextStart, now),
                };
            }
        }

        // Get behavioral insights
        const behaviorAnalysis = await this.analyzeBehavior(userId);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                bitsId: user.bitsId,
            },
            whatsUpNext,
            assignments: assignments.map(a => ({
                id: a.id,
                course: a.courseCode || 'Unknown',
                title: a.title,
                due: a.dueDate.toISOString(),
                priority: a.priority,
                status: a.status,
                description: a.description,
            })),
            evaluations: evaluations.map(e => ({
                id: e.id,
                course: e.courseCode || 'Unknown',
                title: e.title,
                date: e.date.toISOString(),
                type: e.type,
                location: e.location,
                duration: e.duration,
                description: e.description,
            })),
            ongoing: ongoingItem,
            behavior: behaviorAnalysis,
        };
    }

    async getAiTips(userId: string) {
        const cached = this.aiTipsCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        const now = new Date();

        const assignments = await db.select()
            .from(studentAssignments)
            .where(
                and(
                    eq(studentAssignments.userId, userId),
                    gte(studentAssignments.dueDate, now)
                )
            )
            .orderBy(studentAssignments.dueDate)
            .limit(10);

        const pendingAssignments = assignments.filter(a => a.status !== 'completed' && a.status !== 'graded' && a.status !== 'submitted');

        const evaluations = await db.select()
            .from(studentEvaluations)
            .where(
                and(
                    eq(studentEvaluations.userId, userId),
                    gte(studentEvaluations.date, now)
                )
            )
            .orderBy(studentEvaluations.date)
            .limit(10);

        const events = await db.select()
            .from(campusEvents)
            .where(
                and(
                    eq(campusEvents.userId, userId),
                    eq(campusEvents.isEnrolled, true),
                    gte(campusEvents.date, now)
                )
            )
            .orderBy(campusEvents.date)
            .limit(10);

        const [activeSchedule] = await db.select()
            .from(schedules)
            .where(
                and(
                    eq(schedules.userId, userId),
                    eq(schedules.isActive, true)
                )
            )
            .limit(1);

        let scheduleSummary: any[] = [];
        if (activeSchedule) {
            const items = await db.select()
                .from(scheduleItems)
                .where(eq(scheduleItems.scheduleId, activeSchedule.id))
                .orderBy(scheduleItems.startDateTime)
                .limit(15);

            scheduleSummary = items.map((item) => ({
                title: item.title,
                type: item.type,
                start: item.startDateTime,
                end: item.endDateTime,
            }));
        }

        const ai = this.getAiClient();
        const model = this.getAiModel();
        const payload = {
            now: now.toISOString(),
            schedule: scheduleSummary,
            assignments: pendingAssignments.map(a => ({
                title: a.title,
                due: a.dueDate,
                course: a.courseCode,
                priority: a.priority,
                status: a.status,
            })),
            evaluations: evaluations.map(e => ({
                title: e.title,
                date: e.date,
                course: e.courseCode,
                type: e.type,
            })),
            events: events.map(e => ({
                title: e.title,
                date: e.date,
                endDate: e.endDate,
                location: e.location,
            })),
        };

        const systemPrompt = 'You are a helpful student planner. Return 1-3 concise tips as a JSON array of strings. No markdown. Look for schedule clashes ONLY within the current day and mention them.';
        const userPrompt = `Context: ${JSON.stringify(payload)}`;

        const result = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: systemPrompt + '\\n' + userPrompt }] }],
            config: { temperature: 0.2 },
        });

        const text = result.text?.trim() || '';
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start === -1 || end === -1) {
            return { tips: [] };
        }
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (!Array.isArray(parsed)) return { tips: [] };
        const data = { tips: parsed.slice(0, 3) };
        this.aiTipsCache.set(userId, { expiresAt: Date.now() + 60 * 60 * 1000, data });
        return data;
    }

    private getAiClient() {
        const projectId =
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCP_PROJECT_ID ||
            process.env.VERTEX_PROJECT_ID;
        if (!projectId) throw new Error('Google Cloud project ID not configured');
        const location = process.env.GCP_LOCATION || 'global';
        return new GoogleGenAI({ vertexai: true, project: projectId, location });
    }

    private getAiModel() {
        return process.env.STUDENT_PROFILE_TIPS_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    /**
     * Calculate next occurrence of a weekly recurring event
     * Takes a day of week and a template time, returns next occurrence from now
     */
    private calculateNextWeeklyOccurrence(dayOfWeek: string, templateDateTime: Date): Date {
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayIndex = daysOfWeek.indexOf(dayOfWeek);

        if (targetDayIndex === -1) {
            return templateDateTime; // Fallback if invalid day
        }

        const now = new Date();
        const currentDayIndex = now.getDay();

        // Extract time from template in local time
        const hours = templateDateTime.getHours();
        const minutes = templateDateTime.getMinutes();

        // Calculate days until next occurrence
        let daysUntil = targetDayIndex - currentDayIndex;

        // If target day is today, check if time has passed
        if (daysUntil === 0) {
            const todayAtTargetTime = new Date(now);
            todayAtTargetTime.setHours(hours, minutes, 0, 0);

            // If time has passed, use next week
            if (todayAtTargetTime <= now) {
                daysUntil = 7;
            }
        } else if (daysUntil < 0) {
            // Target day already passed this week, use next week
            daysUntil += 7;
        }

        // Create next occurrence date
        const nextOccurrence = new Date(now);
        nextOccurrence.setDate(now.getDate() + daysUntil);
        nextOccurrence.setHours(hours, minutes, 0, 0);

        return nextOccurrence;
    }

    /**
     * Calculate human-readable time until an event
     */
    private calculateTimeUntil(futureDate: Date, nowOverride?: Date): string {
        const now = nowOverride || new Date();
        const diffMs = futureDate.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 0) {
            return 'ongoing';
        }

        if (diffMins < 60) {
            return `in ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
        } else if (diffHours < 24) {
            return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
        } else if (diffDays < 7) {
            return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `in ${weeks} week${weeks !== 1 ? 's' : ''}`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `in ${months} month${months !== 1 ? 's' : ''}`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `in ${years} year${years !== 1 ? 's' : ''}`;
        }
    }

    private toLocalIso(date: Date): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
        ].join('-') + 'T' +
            [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(':');
    }

    private interpretAsZonedWallTime(date: Date, timeZone: string): Date {
        const wall = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
        ));
        return wall;
    }

    private getZonedNow(timeZone: string): Date {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).formatToParts(new Date());
        const lookup = (type: string) => parts.find(p => p.type === type)?.value || '00';
        const year = Number(lookup('year'));
        const month = Number(lookup('month'));
        const day = Number(lookup('day'));
        const hour = Number(lookup('hour'));
        const minute = Number(lookup('minute'));
        const second = Number(lookup('second'));
        return new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
    }

    /**
     * Generate AI Tips based on upcoming items and schedule
     */
    private generateAiTips(assignments: any[], evaluations: any[], whatsUpNext: any, events: any[] = [], scheduleItems: any[] = []): string[] {
        const tips: string[] = [];
        const now = new Date();
        const clashTips = this.detectClashes(events, scheduleItems);
        for (const tip of clashTips) {
            tips.push(tip);
        }

        // Tip about what's up next
        if (whatsUpNext) {
            const startTime = new Date(whatsUpNext.startDateTime);
            const hoursUntil = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

            if (hoursUntil < 1) {
                tips.push(`🔔 Your next item "${whatsUpNext.title}" is starting soon! ${whatsUpNext.timeUntil}`);
            } else if (hoursUntil < 3) {
                tips.push(`⏰ Coming up ${whatsUpNext.timeUntil}: ${whatsUpNext.title}${whatsUpNext.location ? ` at ${whatsUpNext.location}` : ''}`);
            } else if (whatsUpNext.type === 'evaluation') {
                const daysUntil = Math.ceil(hoursUntil / 24);
                if (daysUntil <= 2) {
                    tips.push(`📝 You have an evaluation "${whatsUpNext.title}" ${whatsUpNext.timeUntil}. Consider blocking time for revision today.`);
                }
            } else if (whatsUpNext.type === 'assignment' && hoursUntil < 48) {
                tips.push(`📋 Assignment "${whatsUpNext.title}" is due ${whatsUpNext.timeUntil}. Make sure to allocate time to complete it.`);
            }
        }

        // Check for evaluations tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        const tomorrowEvals = evaluations.filter(e => {
            const evalDate = new Date(e.date);
            return evalDate >= tomorrow && evalDate < dayAfterTomorrow;
        });

        if (tomorrowEvals.length > 0 && tips.length === 0) {
            const eval_ = tomorrowEvals[0];
            tips.push(`🎯 You have a ${eval_.type} tomorrow for ${eval_.course}. Block time for final revision tonight.`);
        }

        // Check for high priority assignments due soon
        const highPriorityDueSoon = assignments.filter(a => {
            const dueDate = new Date(a.due);
            const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return a.priority === 'high' && daysUntilDue <= 2 && a.status !== 'completed';
        });

        if (highPriorityDueSoon.length > 0 && tips.length === 0) {
            const assignment = highPriorityDueSoon[0];
            const dueDate = new Date(assignment.due);
            const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const timeStr = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
            tips.push(`⚠️ High priority: "${assignment.title}" is due ${timeStr}. Consider prioritizing this today.`);
        }

        // Check for multiple items today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow2 = new Date(today);
        tomorrow2.setDate(tomorrow2.getDate() + 1);

        const todayAssignments = assignments.filter(a => {
            const due = new Date(a.due);
            return due >= today && due < tomorrow2 && a.status !== 'completed';
        });

        if (todayAssignments.length > 2 && tips.length === 0) {
            tips.push(`📚 You have ${todayAssignments.length} assignments due today. Focus on high-priority items first!`);
        }

        // Check schedule density for today
        if (whatsUpNext && tips.length === 0) {
            const nextDate = new Date(whatsUpNext.startDateTime);
            if (nextDate >= today && nextDate < tomorrow2) {
                tips.push(`📅 You have items scheduled for today. Stay organized and check your timetable regularly.`);
            }
        }

        // Motivational tips if nothing urgent
        if (tips.length === 0) {
            const motivationalTips = [
                '✨ You\'re on track! Keep up the great work and stay consistent.',
                '🌟 No urgent deadlines right now. Great time to get ahead on upcoming work!',
                '💪 You have a productive day ahead. Check your schedule for optimal study times.',
                '🎓 All caught up! Consider reviewing past material or planning ahead.',
                '🚀 Smooth sailing ahead! Use this time wisely to stay ahead of deadlines.',
            ];
            tips.push(motivationalTips[Math.floor(Math.random() * motivationalTips.length)]);
        }

        return tips;
    }

    private detectClashes(events: any[], scheduleItems: any[]): string[] {
        const tips: string[] = [];
        if (!events.length || !scheduleItems.length) return tips;

        const upcomingEvents = events
            .filter((e) => e?.date)
            .map((e) => ({
                title: e.title,
                start: new Date(e.date),
                end: e.endDate ? new Date(e.endDate) : new Date(e.date),
            }));

        const upcomingSchedule = scheduleItems
            .map((entry) => {
                const item = entry.item ?? entry;
                const nextStart = entry.nextStart ? new Date(entry.nextStart) : new Date(item.startDateTime);
                const nextEnd = entry.nextEnd ? new Date(entry.nextEnd) : new Date(item.endDateTime || item.startDateTime);
                return {
                    title: item.title,
                    type: item.type,
                    start: nextStart,
                    end: nextEnd,
                };
            })
            .filter((s) => s.end >= new Date());

        for (const event of upcomingEvents) {
            const clashes = upcomingSchedule.filter(
                (s) => event.start < s.end && event.end > s.start
            );
            if (clashes.length > 0) {
                const top = clashes[0];
                tips.push(`⚠️ Clash detected: "${event.title}" overlaps with "${top.title}". Classes/labs are prioritized.`);
                break;
            }
        }

        return tips;
    }
}

export const studentProfileService = new StudentProfileService();

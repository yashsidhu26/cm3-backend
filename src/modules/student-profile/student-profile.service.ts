import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../../core/database/client';
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
    type learningStyleEnum
} from './student-profile.schema';
import { user as userTable } from '../auth/auth.schema';

/**
 * Student Profile Service
 * Implements "Smart" features: Gap Analysis, Behavioral Analysis, Personalized Plans
 */

export class StudentProfileService {

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
        const now = new Date();
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

        // Get active schedule
        const [activeSchedule] = await db.select()
            .from(schedules)
            .where(
                and(
                    eq(schedules.userId, userId),
                    eq(schedules.isActive, true)
                )
            )
            .limit(1);

        // Get what's up next from schedule (next upcoming item, no matter how far)
        let whatsUpNext = null;
        if (activeSchedule) {
            // Get all schedule items (both recurring and one-time)
            const allItems = await db.select()
                .from(scheduleItems)
                .where(eq(scheduleItems.scheduleId, activeSchedule.id));

            // Calculate next occurrence for each item
            const itemsWithNextOccurrence = allItems
                .map(item => {
                    let nextOccurrence: Date;

                    if (item.isRecurring && item.recurrencePattern === 'weekly' && item.dayOfWeek) {
                        // For recurring weekly items, calculate next occurrence
                        nextOccurrence = this.calculateNextWeeklyOccurrence(
                            item.dayOfWeek,
                            item.startDateTime
                        );
                    } else {
                        // For one-time events, use the startDateTime as-is
                        nextOccurrence = item.startDateTime;
                    }

                    return {
                        item,
                        nextOccurrence,
                    };
                })
                .filter(({ nextOccurrence }) => nextOccurrence >= now) // Only future occurrences
                .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime()); // Sort by time

            // Get the next upcoming item
            if (itemsWithNextOccurrence.length > 0) {
                const { item, nextOccurrence } = itemsWithNextOccurrence[0];

                whatsUpNext = {
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    description: item.description,
                    startDateTime: nextOccurrence.toISOString(),
                    endDateTime: item.endDateTime?.toISOString(),
                    location: item.location,
                    linkedEntityType: item.linkedEntityType,
                    color: item.color,
                    isRecurring: item.isRecurring,
                    dayOfWeek: item.dayOfWeek,
                    // Calculate time until event
                    timeUntil: this.calculateTimeUntil(nextOccurrence),
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
            behavior: behaviorAnalysis,
            aiTips: this.generateAiTips(assignments, evaluations, whatsUpNext),
        };
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

        // Extract time from template (in UTC to match how we store them)
        const hours = templateDateTime.getUTCHours();
        const minutes = templateDateTime.getUTCMinutes();

        // Calculate days until next occurrence
        let daysUntil = targetDayIndex - currentDayIndex;

        // If target day is today, check if time has passed
        if (daysUntil === 0) {
            const todayAtTargetTime = new Date(now);
            todayAtTargetTime.setUTCHours(hours, minutes, 0, 0);

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
        nextOccurrence.setUTCHours(hours, minutes, 0, 0);

        return nextOccurrence;
    }

    /**
     * Calculate human-readable time until an event
     */
    private calculateTimeUntil(futureDate: Date): string {
        const now = new Date();
        const diffMs = futureDate.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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

    /**
     * Generate AI Tips based on upcoming items and schedule
     */
    private generateAiTips(assignments: any[], evaluations: any[], whatsUpNext: any): string[] {
        const tips: string[] = [];
        const now = new Date();

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
}

export const studentProfileService = new StudentProfileService();

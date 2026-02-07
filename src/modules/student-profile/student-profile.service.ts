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

        // Get behavioral insights
        const behaviorAnalysis = await this.analyzeBehavior(userId);

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                bitsId: user.bitsId,
            },
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
            aiTips: this.generateAiTips(assignments, evaluations),
        };
    }

    /**
     * Generate AI Tips based on upcoming items
     */
    private generateAiTips(assignments: any[], evaluations: any[]): string[] {
        const tips: string[] = [];

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

        if (tomorrowEvals.length > 0) {
            const eval_ = tomorrowEvals[0];
            tips.push(`You have a ${eval_.type} tomorrow. I've blocked 7 PM - 9 PM for revision.`);
        }

        // Check for high priority assignments due soon
        const highPriorityDueSoon = assignments.filter(a => {
            const dueDate = new Date(a.due);
            const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return a.priority === 'high' && daysUntilDue <= 2;
        });

        if (highPriorityDueSoon.length > 0) {
            const assignment = highPriorityDueSoon[0];
            tips.push(`High priority: "${assignment.title}" is due soon. Consider working on it today.`);
        }

        // Default tip if nothing urgent
        if (tips.length === 0) {
            tips.push('You have a productive day ahead. Check your schedule for optimal study times.');
        }

        return tips;
    }
}

export const studentProfileService = new StudentProfileService();

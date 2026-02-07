import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { db } from '../../core/database/client';
import {
    studentProfiles,
    studentAcademics,
    studentExperiences,
    activityLogs
} from './student-profile.schema';
import { user } from '../../core/database/schema';
import { eq } from 'drizzle-orm';
import { studentProfileService } from './student-profile.service';
import { randomUUID } from 'crypto';

describe('StudentProfileService', () => {
    const testUserId = randomUUID();

    beforeEach(async () => {
        // Create a test user
        try {
            await db.insert(user).values({
                id: testUserId,
                name: 'Test Student',
                email: `test_${testUserId}@example.com`,
                emailVerified: true,
            });
        } catch (e) {
            // Ignore if exists
        }
    });

    afterEach(async () => {
        // Cleanup
        try {
            await db.delete(activityLogs).where(eq(activityLogs.userId, testUserId));
            await db.delete(studentExperiences).where(eq(studentExperiences.userId, testUserId));
            await db.delete(studentAcademics).where(eq(studentAcademics.userId, testUserId));
            await db.delete(studentProfiles).where(eq(studentProfiles.userId, testUserId));
            await db.delete(user).where(eq(user.id, testUserId));
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    test('upsertProfile should create and update profile', async () => {
        const data = {
            userId: testUserId,
            learningStyle: 'visual' as const,
            bio: 'Initial bio'
        };

        const [created] = await studentProfileService.upsertProfile(testUserId, data);
        expect(created.bio).toBe('Initial bio');
        expect(created.learningStyle).toBe('visual');

        const [updated] = await studentProfileService.upsertProfile(testUserId, {
            ...data,
            bio: 'Updated bio'
        });
        expect(updated.bio).toBe('Updated bio');
    });

    test('upsertAcademics should handle skills and interests', async () => {
        const data = {
            userId: testUserId,
            major: 'Computer Science',
            skills: ['Python', 'SQL'],
            interests: ['Machine Learning']
        };

        const [created] = await studentProfileService.upsertAcademics(testUserId, data);
        expect(created.major).toBe('Computer Science');
        expect(created.skills).toContain('Python');

        const [updated] = await studentProfileService.upsertAcademics(testUserId, {
            ...data,
            skills: ['Python', 'SQL', 'TypeScript']
        });
        expect(updated.skills).toContain('TypeScript');
    });

    test('runGapAnalysis should identify missing skills for interests', async () => {
        // Setup: Interest in "AI" but no "AI" skills
        await studentProfileService.upsertAcademics(testUserId, {
            interests: ['Artificial Intelligence', 'Robotics'],
            skills: ['Python', 'Web Dev']
        });

        const suggestions = await studentProfileService.runGapAnalysis(testUserId);
        console.log('Gap Suggestions:', JSON.stringify(suggestions));

        // Should suggest for both interests
        expect(suggestions.length).toBeGreaterThan(0);
        const aiSuggestion = suggestions.find(s => s.interest === 'Artificial Intelligence');
        expect(aiSuggestion).toBeDefined();
        expect(aiSuggestion?.type).toBe('course_recommendation');
    });

    test('analyzeBehavior should calculate completion rates and peak windows', async () => {
        // Add 3 completed logs (10 AM - Morning) and 1 skipped log
        const morningDate = new Date();
        morningDate.setHours(10, 0, 0);

        await db.insert(activityLogs).values([
            { userId: testUserId, status: 'completed', completionTime: morningDate },
            { userId: testUserId, status: 'completed', completionTime: morningDate },
            { userId: testUserId, status: 'completed', completionTime: morningDate },
            { userId: testUserId, status: 'cancelled' }
        ]);

        const analysis = await studentProfileService.analyzeBehavior(testUserId);
        console.log('Behavior Analysis:', JSON.stringify(analysis));

        expect(analysis.completionRate).toBe(75); // 3/4
        expect(analysis.peakProductivityWindow).toContain('Morning');
        expect(analysis.totalTasksLogged).toBe(4);
    });

    test('getSmartStudyPlan should shift tasks based on peak window', async () => {
        // Setup Night Owl behavior (11 PM)
        const nightDate = new Date();
        nightDate.setHours(23, 0, 0);

        await db.insert(activityLogs).values([
            { userId: testUserId, status: 'completed', completionTime: nightDate }
        ]);

        const smartPlan = await studentProfileService.getSmartStudyPlan(testUserId);

        expect(smartPlan.analysis.peakProductivityWindow).toContain('Night');
        expect(smartPlan.plan.length).toBe(3);

        // Original morning task (10 AM) shifted for a Night Owl (shift by 8)
        const morningTask = smartPlan.plan.find(p => p.originalTime === '10:00');
        expect(morningTask?.personalizedTime).toBe('18:00'); // 10 + 8
    });
});

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import studentProfileRoutes from './student-profile.routes';
import { db } from '../../core/database/client';
import { user } from '../../core/database/schema';
import {
    studentProfiles,
    studentAcademics,
    activityLogs
} from './student-profile.schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('Student Profile Routes', () => {
    const app = new Hono().route('/api/student-profile', studentProfileRoutes);
    const testUserId = randomUUID();

    beforeEach(async () => {
        try {
            await db.insert(user).values({
                id: testUserId,
                name: 'Route Test User',
                email: `route_${testUserId}@example.com`,
                emailVerified: true,
            });
        } catch (e) { }
    });

    afterEach(async () => {
        try {
            await db.delete(activityLogs).where(eq(activityLogs.userId, testUserId));
            await db.delete(studentAcademics).where(eq(studentAcademics.userId, testUserId));
            await db.delete(studentProfiles).where(eq(studentProfiles.userId, testUserId));
            await db.delete(user).where(eq(user.id, testUserId));
        } catch (e) { }
    });

    test('POST /api/student-profile/profile', async () => {
        const res = await app.request('/api/student-profile/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: testUserId,
                learningStyle: 'kinesthetic',
                bio: 'Route test bio'
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data[0].bio).toBe('Route test bio');
    });

    test('POST /api/student-profile/academics', async () => {
        const res = await app.request('/api/student-profile/academics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: testUserId,
                major: 'Physics',
                skills: ['Calculus'],
                interests: ['Quantum Mechanics']
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data[0].major).toBe('Physics');
    });

    test('POST /api/student-profile/log-activity', async () => {
        const res = await app.request('/api/student-profile/log-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: testUserId,
                scheduledTime: new Date().toISOString(),
                priority: 'high',
                status: 'completed'
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.priority).toBe('high');
    });

    test('GET /api/student-profile/dashboard/:userId', async () => {
        // Setup initial data
        await app.request('/api/student-profile/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: testUserId, bio: 'Dashboard Test' }),
        });

        const res = await app.request(`/api/student-profile/dashboard/${testUserId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.profile.bio).toBe('Dashboard Test');
        expect(data.insights).toBeDefined();
    });

    test('GET /api/student-profile/student/:userId/smart-plan', async () => {
        const res = await app.request(`/api/student-profile/student/${testUserId}/smart-plan`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.plan).toBeDefined();
        expect(data.analysis).toBeDefined();
    });
});

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import spotifyRoutes from './spotify.routes';
import * as spotifyHelpers from './spotify';
import { db } from './database';

/**
 * Spotify Routes Tests
 */

// Mock the database
mock.module('./database', () => ({
    db: {
        insert: mock(() => ({
            values: mock(() => ({
                onConflictDoUpdate: mock(() => Promise.resolve()),
                returning: mock(() => [{ id: 'test-id' }]),
            })),
        })),
        select: mock(() => ({
            from: mock(() => ({
                where: mock(() => ({
                    get: mock(() => Promise.resolve({ count: 1 })),
                    all: mock(() => Promise.resolve([])),
                })),
                all: mock(() => Promise.resolve([])),
            })),
        })),
        update: mock(() => ({
            set: mock(() => ({
                where: mock(() => Promise.resolve()),
            })),
        })),
        delete: mock(() => ({
            where: mock(() => Promise.resolve()),
        })),
    },
}));

// Mock spotify helpers
mock.module('./spotify', () => ({
    getCurrentPlayback: mock(() => Promise.resolve({
        item: {
            id: 'track-123',
            name: 'Test Song',
            artists: [{ name: 'Test Artist' }]
        }
    })),
}));

describe('spotify.routes', () => {
    let app: Hono;
    const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };

    beforeEach(() => {
        app = new Hono();
        // Inject mock user
        app.use('*', async (c, next) => {
            c.set('user', mockUser);
            await next();
        });
        app.route('/spotify', spotifyRoutes);
    });

    test('GET /spotify/discovery/queue returns songs', async () => {
        const res = await app.request('/spotify/discovery/queue');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test('POST /spotify/discovery/vote records a vote', async () => {
        const res = await app.request('/spotify/discovery/vote', {
            method: 'POST',
            body: JSON.stringify({ trackId: 'q1', vote: true }),
            headers: { 'Content-Type': 'application/json' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
    });

    test('POST /spotify/capsule/whisper tags audio with Spotify metadata', async () => {
        const res = await app.request('/spotify/capsule/whisper', {
            method: 'POST',
            body: JSON.stringify({ capsuleId: 'cap-1' }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer mock-token'
            }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.taggedWith.trackName).toBe('Test Song');
    });

    test('POST /spotify/capsule/flash/react records reaction', async () => {
        // First reaction
        const res = await app.request('/spotify/capsule/flash/react', {
            method: 'POST',
            body: JSON.stringify({ capsuleId: 'cap-1', reaction: '🔥' }),
            headers: { 'Content-Type': 'application/json' }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.status).toBeDefined();
    });
});

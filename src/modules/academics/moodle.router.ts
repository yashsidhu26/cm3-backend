
import { Hono } from 'hono';
import { protect } from '../../core/auth/middleware';
import { moodleClient, MoodleError } from './moodle.service';
import * as moodleAuth from './moodle-auth.service';
import { auth } from '../../core/auth/auth';
import { db } from '../../core/database/client';
import { user as userTable, session as sessionTable } from '../auth/auth.schema';
import { eq } from 'drizzle-orm';
import { successResponse, errorResponse } from '../../core/utils/response';
import { createHmac, randomBytes } from 'crypto';

const app = new Hono();

/**
 * POST /sign-in
 * Moodle-based sign-in: authenticates with Moodle, auto-creates local account, stores token
 * Does NOT require existing auth — this IS the sign-in
 */
app.post('/sign-in', async (c) => {
    const { username, password } = await c.req.json();

    if (!username || !password) {
        return errorResponse(c, 'Username and password are required', 400);
    }

    try {
        // 1. Authenticate with Moodle
        const moodleResponse = await moodleClient.authenticate(username, password);

        // 2. Get user info from Moodle
        const siteInfo = await moodleClient.getSiteInfo(moodleResponse.token);

        const email = siteInfo.useremail
            || (username.includes('@') ? username : `${username}@pilani.bits-pilani.ac.in`);
        const fullname = siteInfo.fullname || `${siteInfo.firstname} ${siteInfo.lastname}`;

        // 3. Check if local user exists by email
        const existingUsers = await db
            .select()
            .from(userTable)
            .where(eq(userTable.email, email));

        let localUser = existingUsers[0];
        let generatedPassword: string | null = null;

        if (localUser) {
            // Update bitsId if not set
            if (!localUser.bitsId) {
                await db
                    .update(userTable)
                    .set({ bitsId: username, updatedAt: new Date() })
                    .where(eq(userTable.id, localUser.id));
            }
        } else {
            // Create new user via Better Auth
            generatedPassword = `moodle_${crypto.randomUUID()}`;
            const signUpResponse = await auth.api.signUpEmail({
                body: {
                    email,
                    password: generatedPassword,
                    name: fullname,
                },
            });

            if (!signUpResponse?.user) {
                return errorResponse(c, 'Failed to create account', 500);
            }

            // Set bitsId on the newly created user
            await db
                .update(userTable)
                .set({ bitsId: username })
                .where(eq(userTable.id, signUpResponse.user.id));

            const freshUsers = await db
                .select()
                .from(userTable)
                .where(eq(userTable.id, signUpResponse.user.id));
            localUser = freshUsers[0];
        }

        if (!localUser) {
            return errorResponse(c, 'Failed to resolve user account', 500);
        }

        // 4. Store encrypted Moodle token
        await moodleAuth.login(localUser.id, username, password);

        // 5. Create a Better Auth session directly
        const sessionToken = randomBytes(24).toString('base64url'); // Match Better Auth token format
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.insert(sessionTable).values({
            userId: localUser.id,
            token: sessionToken,
            expiresAt,
            ipAddress: c.req.header('x-forwarded-for') || null,
            userAgent: c.req.header('user-agent') || null,
        });

        // Sign the token with HMAC-SHA256 (same as Better Auth)
        const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
        const signature = createHmac('sha256', secret).update(sessionToken).digest('base64');
        const signedToken = `${sessionToken}.${signature}`;

        // Set session cookie (matches Better Auth's cookie format)
        c.header('set-cookie', `super-app.session_token=${encodeURIComponent(signedToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`);

        return successResponse(c, {
            message: 'Signed in via Moodle successfully',
            user: {
                id: localUser.id,
                name: localUser.name,
                email: localUser.email,
                bitsId: localUser.bitsId || username,
            },
            moodle: {
                userId: moodleResponse.userId,
                username: siteInfo.username,
                sitename: siteInfo.sitename,
            },
        });
    } catch (error: any) {
        console.error('Moodle sign-in failed:', error);
        if (error instanceof MoodleError) {
            return errorResponse(c, error.message, error.statusCode, error.code);
        }
        return errorResponse(c, error.message || 'Moodle sign-in failed', 500);
    }
});

/**
 * POST /login
 * Link Moodle to existing authenticated account
 */
app.post('/login', protect, async (c) => {
    const { username, password } = await c.req.json();
    const user = c.get('user');

    if (!username || !password) {
        return errorResponse(c, 'Username and password are required', 400);
    }

    try {
        await moodleAuth.login(user.id, username, password);
        return successResponse(c, { message: 'Connected to Moodle successfully' });
    } catch (error: any) {
        console.error('Moodle login failed:', error);
        if (error instanceof MoodleError) {
            return errorResponse(c, error.message, error.statusCode, error.code);
        }
        return errorResponse(c, error.message || 'Failed to connect to Moodle', 500);
    }
});

/**
 * GET /status
 * Get Moodle connection status
 */
app.get('/status', protect, async (c) => {
    const user = c.get('user');
    const status = await moodleAuth.getAuthStatus(user.id);
    return successResponse(c, status);
});

/**
 * GET /courses
 * Fetch user's courses directly from Moodle (real-time, not from DB)
 */
app.get('/courses', protect, async (c) => {
    const user = c.get('user');

    const token = await moodleAuth.getMoodleToken(user.id);
    if (!token) {
        return errorResponse(c, 'Moodle not connected', 401);
    }

    const moodleUserId = await moodleAuth.getMoodleUserId(user.id);
    if (!moodleUserId) {
        return errorResponse(c, 'Moodle user ID not found', 400);
    }

    try {
        const courses = await moodleClient.fetchCourses(token, moodleUserId);
        return successResponse(c, { courses, count: courses.length });
    } catch (error: any) {
        if (error instanceof MoodleError) {
            return errorResponse(c, error.message, error.statusCode, error.code);
        }
        return errorResponse(c, 'Failed to fetch courses from Moodle', 500);
    }
});

/**
 * GET /courses/:courseId/resources
 * Fetch course contents/files directly from Moodle (real-time)
 */
app.get('/courses/:courseId/resources', protect, async (c) => {
    const user = c.get('user');
    const courseId = c.req.param('courseId');

    const token = await moodleAuth.getMoodleToken(user.id);
    if (!token) {
        return errorResponse(c, 'Moodle not connected', 401);
    }

    try {
        const resources = await moodleClient.fetchCourseResources(token, courseId);
        return successResponse(c, { courseId, resources, count: resources.length });
    } catch (error: any) {
        if (error instanceof MoodleError) {
            return errorResponse(c, error.message, error.statusCode, error.code);
        }
        return errorResponse(c, 'Failed to fetch course resources from Moodle', 500);
    }
});

/**
 * GET /notifications
 * Get Moodle notifications
 */
app.get('/notifications', protect, async (c) => {
    const user = c.get('user');

    const token = await moodleAuth.getMoodleToken(user.id);
    if (!token) {
        return errorResponse(c, 'Moodle not connected', 401);
    }

    const moodleUserId = await moodleAuth.getMoodleUserId(user.id);
    if (!moodleUserId) {
        return errorResponse(c, 'Moodle user ID not found', 400);
    }

    const notifications = await moodleClient.fetchNotifications(token, moodleUserId);
    return successResponse(c, { notifications, count: notifications.length });
});

/**
 * DELETE /logout
 * Disconnect Moodle from account
 */
app.delete('/logout', protect, async (c) => {
    const user = c.get('user');
    await moodleAuth.logout(user.id);
    return successResponse(c, { message: 'Disconnected from Moodle' });
});

export default app;


import { Hono } from 'hono';
import { protect } from '../../core/auth/middleware';
import { moodleClient } from './moodle.service';
import * as moodleAuth from './moodle-auth.service';

const app = new Hono();

// All routes require authentication
app.use('*', protect);

/**
 * Login to Moodle
 */
app.post('/login', async (c) => {
    const { username, password } = await c.req.json();
    const user = c.get('user');

    if (!username || !password) {
        return c.json({ error: 'Username and password are required' }, 400);
    }

    try {
        await moodleAuth.login(user.id, username, password);
        return c.json({ success: true, message: 'Connected to Moodle successfully' });
    } catch (error: any) {
        console.error('Moodle login failed:', error);
        return c.json({
            error: error.message || 'Failed to connect to Moodle',
            code: error.code || 'UNKNOWN_ERROR'
        }, error.statusCode || 500);
    }
});

/**
 * Get Moodle connection status
 */
app.get('/status', async (c) => {
    const user = c.get('user');
    const status = await moodleAuth.getAuthStatus(user.id);
    return c.json(status);
});

/**
 * Get Moodle notifications
 */
app.get('/notifications', async (c) => {
    const user = c.get('user');

    // Get decrypted token
    const token = await moodleAuth.getMoodleToken(user.id);

    if (!token) {
        return c.json({ error: 'Moodle not connected' }, 401);
    }

    // Get Moodle User ID (needed for notifications)
    const status = await moodleAuth.getAuthStatus(user.id);
    if (!status.moodleUserId) {
        return c.json({ error: 'Moodle user ID not found' }, 400);
    }

    // Fetch notifications
    const notifications = await moodleClient.fetchNotifications(token, status.moodleUserId);
    return c.json({ notifications });
});

/**
 * Logout from Moodle
 */
app.delete('/logout', async (c) => {
    const user = c.get('user');
    await moodleAuth.logout(user.id);
    return c.json({ success: true, message: 'Disconnected from Moodle' });
});

export default app;

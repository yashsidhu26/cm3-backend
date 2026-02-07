/**
 * StudyDeck Auth Routes
 * Endpoints for managing StudyDeck authentication
 */

import { Hono } from 'hono';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import * as studyDeckAuth from './studydeck-auth.service';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

/**
 * POST /login
 * Store StudyDeck JWT token for user
 */
const loginSchema = z.object({
  token: z.string().min(1, 'StudyDeck JWT token is required'),
});

app.post('/login', protect, zValidator('json', loginSchema), async (c) => {
  const user = c.get('user');
  const { token } = c.req.valid('json');

  try {
    await studyDeckAuth.storeToken(user.id, token);
    return successResponse(c, {
      message: 'StudyDeck token stored successfully',
    });
  } catch (error: any) {
    console.error('StudyDeck token storage failed:', error);
    return errorResponse(c, 'Failed to store StudyDeck token', 500);
  }
});

/**
 * GET /status
 * Check if user has StudyDeck token
 */
app.get('/status', protect, async (c) => {
  const user = c.get('user');

  try {
    const hasToken = await studyDeckAuth.hasToken(user.id);
    return successResponse(c, {
      connected: hasToken,
    });
  } catch (error: any) {
    console.error('Failed to check StudyDeck status:', error);
    return errorResponse(c, 'Failed to check StudyDeck status', 500);
  }
});

/**
 * DELETE /logout
 * Remove StudyDeck token
 */
app.delete('/logout', protect, async (c) => {
  const user = c.get('user');

  try {
    await studyDeckAuth.deleteToken(user.id);
    return successResponse(c, {
      message: 'StudyDeck token removed successfully',
    });
  } catch (error: any) {
    console.error('Failed to remove StudyDeck token:', error);
    return errorResponse(c, 'Failed to remove StudyDeck token', 500);
  }
});

export default app;

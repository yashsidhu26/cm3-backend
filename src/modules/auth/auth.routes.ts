import { Hono } from 'hono';
import { auth } from '../../core/auth/auth';
import { protect, requireAdmin, optionalAuth } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { db } from '../../core/database/client';
import { user } from './auth.schema';
import { eq } from 'drizzle-orm';

/**
 * Auth Module Routes
 * Handles all authentication endpoints via Better Auth
 */

const authRoutes = new Hono();

/**
 * CUSTOM ENDPOINTS - Must be defined BEFORE wildcard handler
 * These take precedence over Better Auth's default endpoints
 */

/**
 * Custom endpoint: Get current session
 * GET /session
 * Better Auth doesn't expose this as a handler endpoint, so we implement it
 */
authRoutes.get('/session', async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session) {
      return c.json(session);
    }

    return c.json({ user: null, session: null });
  } catch (error: any) {
    console.error('[Session] Error:', error);
    return c.json({ user: null, session: null });
  }
});

/**
 * Custom endpoint: Sign out
 * POST /sign-out
 * Properly handles session cleanup
 */
authRoutes.post('/sign-out', async (c) => {
  try {
    const result = await auth.api.signOut({
      headers: c.req.raw.headers,
    });

    return c.json({ success: true, message: 'Signed out successfully' });
  } catch (error: any) {
    console.error('[Sign Out] Error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * Custom endpoint: Get current user profile
 * GET /profile
 * Requires authentication
 */
authRoutes.get('/profile', protect, async (c) => {
  const currentUser = c.get('user');
  
  if (!currentUser) {
    return errorResponse(c, 'User not found', 404);
  }

  // Fetch full user details from database
  const userData = await db.select().from(user).where(eq(user.id, currentUser.id));
  
  if (!userData[0]) {
    return errorResponse(c, 'User not found', 404);
  }

  return successResponse(c, {
    user: {
      id: userData[0].id,
      name: userData[0].name,
      email: userData[0].email,
      role: userData[0].role,
      bitsId: userData[0].bitsId,
      emailVerified: userData[0].emailVerified,
      createdAt: userData[0].createdAt,
    },
  });
});

/**
 * Custom endpoint: Update user profile
 * PATCH /profile
 * Requires authentication
 */
authRoutes.patch('/profile', protect, async (c) => {
  const currentUser = c.get('user');
  
  if (!currentUser) {
    return errorResponse(c, 'User not found', 404);
  }

  const body = await c.req.json();
  const { name, bitsId } = body;

  // Update user in database
  const updated = await db
    .update(user)
    .set({
      ...(name && { name }),
      ...(bitsId && { bitsId }),
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning();

  return successResponse(c, {
    user: {
      id: updated[0].id,
      name: updated[0].name,
      email: updated[0].email,
      role: updated[0].role,
      bitsId: updated[0].bitsId,
    },
    message: 'Profile updated successfully',
  });
});

/**
 * Custom endpoint: List all users (Admin only)
 * GET /users
 * Requires admin role
 */
authRoutes.get('/users', requireAdmin, async (c) => {
  const users = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    bitsId: user.bitsId,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  }).from(user);

  return successResponse(c, {
    users,
    count: users.length,
  });
});

/**
 * Custom endpoint: Update user role (Admin only)
 * PATCH /users/:id/role
 * Requires admin role
 */
authRoutes.patch('/users/:id/role', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const body = await c.req.json();
  const { role } = body;

  if (!role || !['student', 'admin'].includes(role)) {
    return errorResponse(c, 'Invalid role. Must be "student" or "admin"', 400);
  }

  const updated = await db
    .update(user)
    .set({ role: role as 'student' | 'admin', updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning();

  if (!updated[0]) {
    return errorResponse(c, 'User not found', 404);
  }

  return successResponse(c, {
    user: {
      id: updated[0].id,
      name: updated[0].name,
      email: updated[0].email,
      role: updated[0].role,
    },
    message: 'User role updated successfully',
  });
});

/**
 * Custom endpoint: Delete user (Admin only)
 * DELETE /users/:id
 * Requires admin role
 */
authRoutes.delete('/users/:id', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const currentUser = c.get('user');

  // Prevent self-deletion
  if (userId === currentUser?.id) {
    return errorResponse(c, 'Cannot delete your own account', 400);
  }

  await db.delete(user).where(eq(user.id, userId));

  return successResponse(c, {
    message: 'User deleted successfully',
  });
});

/**
 * Custom endpoint: Check authentication status
 * GET /status
 * Optional authentication
 */
authRoutes.get('/status', optionalAuth, async (c) => {
  const currentUser = c.get('user');

  return successResponse(c, {
    authenticated: !!currentUser,
    user: currentUser ? {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: (currentUser as any).role || 'student',
    } : null,
  });
});

/**
 * Better Auth Handler - MUST be last!
 * Handles all standard auth endpoints:
 * 
 * POST   /sign-up/email          - Register new user
 * POST   /sign-in/email          - Login with email/password
 * POST   /sign-out               - Logout
 * GET    /session                - Get current session
 * POST   /forget-password        - Request password reset
 * POST   /reset-password         - Reset password with token
 * POST   /verify-email           - Verify email address
 * 
 * This wildcard MUST be last so custom routes above can match first
 */
authRoutes.all('*', async (c) => {
  return auth.handler(c.req.raw);
});

export default authRoutes;

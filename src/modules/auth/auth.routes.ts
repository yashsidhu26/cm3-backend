import { Hono } from 'hono';
import { SessionService, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '../../core/auth/session';
import { getSignedCookie, deleteCookie, setSignedCookie } from 'hono/cookie';
import { protect, requireAdmin, optionalAuth } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { db } from '../../core/database/client';
import { user } from './auth.schema';
import { eq } from 'drizzle-orm';
import { auth } from '../../core/auth/auth'; // Still needed if we use auth.api internally for now


/**
 * Auth Module Routes
 * Handles all authentication endpoints via custom session logic
 */

const authRoutes = new Hono();

/**
 * CUSTOM ENDPOINTS - Must be defined BEFORE wildcard handler
 */

/**
 * Custom endpoint: Get current session
 * GET /session
 */
authRoutes.get('/session', async (c) => {
  try {
    const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
    const token = await getSignedCookie(c, secret, SESSION_COOKIE_NAME);

    if (token) {
      const sessionData = await SessionService.validateSession(token);
      if (sessionData) {
        return c.json(sessionData);
      }
    }

    return c.json({ user: null, session: null });
  } catch (error: any) {
    console.error('[Session] Error:', error);
    return c.json({ user: null, session: null });
  }
});

/**
 * Custom endpoint: Sign up with email
 * POST /sign-up/email
 */
authRoutes.post('/sign-up/email', async (c) => {
  try {
    const body = await c.req.json();

    // Use Better Auth to create user (it handles password hashing, validation, etc.)
    const response = await auth.api.signUpEmail({
      body,
    });

    if (!response || !response.user) {
      return errorResponse(c, 'Failed to create account', 400);
    }

    // Create our reliable session
    const { token: sessionToken } = await SessionService.createSession(
      response.user.id,
      c.req.header('user-agent'),
      c.req.header('x-forwarded-for')
    );

    // Set our signed cookie
    const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
    await setSignedCookie(c, SESSION_COOKIE_NAME, sessionToken, secret, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
      maxAge: SESSION_MAX_AGE,
    });

    return successResponse(c, {
      user: response.user,
      message: 'Account created and signed in successfully',
    }, 201);
  } catch (error: any) {
    console.error('[Sign Up] Error:', error);
    return errorResponse(c, error.message || 'Registration failed', 400);
  }
});

/**
 * Custom endpoint: Sign in with email
 * POST /sign-in/email
 */
authRoutes.post('/sign-in/email', async (c) => {
  try {
    const { email, password } = await c.req.json();

    // Use Better Auth to verify credentials (don't set cookie yet)
    const response = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    if (!response || !response.user) {
      return errorResponse(c, 'Invalid email or password', 401);
    }

    // Create our reliable session
    const { token: sessionToken } = await SessionService.createSession(
      response.user.id,
      c.req.header('user-agent'),
      c.req.header('x-forwarded-for')
    );

    // Set our signed cookie
    const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
    await setSignedCookie(c, SESSION_COOKIE_NAME, sessionToken, secret, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
      maxAge: SESSION_MAX_AGE,
    });

    return successResponse(c, {
      user: response.user,
      message: 'Signed in successfully',
    });
  } catch (error: any) {
    console.error('[Sign In] Error:', error);
    return errorResponse(c, error.message || 'Authentication failed', 401);
  }
});
/**
 * Custom endpoint: Sign out
 * POST /sign-out
 */
authRoutes.post('/sign-out', async (c) => {
  try {
    const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
    const token = await getSignedCookie(c, secret, SESSION_COOKIE_NAME);

    if (token) {
      await SessionService.invalidateSession(token);
    }

    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    });

    return successResponse(c, { message: 'Signed out successfully' });
  } catch (error: any) {
    console.error('[Sign Out] Error:', error);
    return errorResponse(c, error.message || 'Logout failed', 500);
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

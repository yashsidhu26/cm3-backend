import { type Context, type Next } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import { SessionService } from './session';
import { errorResponse } from '../utils/response';
import { auth, type AuthUser } from './auth';

// Extend Hono context with user logic (keeping previous augmentation)
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser | null; // Keep AuthUser type for compatibility or update to schema type
    session: any;
  }
}

// Inject User Middleware
export async function injectUser(c: Context, next: Next) {
  try {
    const secret = process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production';
    const token = await getSignedCookie(c, secret, 'super-app.session_token');

    if (token) {
      const sessionData = await SessionService.validateSession(token);
      if (sessionData) {
        c.set('user', sessionData.user);
        c.set('session', sessionData.session);
      } else {
        c.set('user', null);
        c.set('session', null);
      }
    } else {
      c.set('user', null);
      c.set('session', null);
    }
  } catch (error) {
    console.error('Error injecting user:', error);
    c.set('user', null);
    c.set('session', null);
  }

  await next();
}

/**
 * Protect Middleware
 * Requires user to be authenticated
 * Returns 401 if not authenticated
 * 
 * Usage:
 * app.get('/protected', protect, (c) => {
 *   const user = c.get('user');
 *   return c.json({ message: `Hello ${user.name}` });
 * });
 */
export async function protect(c: Context, next: Next) {
  const user = c.get('user');

  if (!user) {
    return errorResponse(
      c,
      'Authentication required',
      401,
      'UNAUTHORIZED',
      { message: 'You must be logged in to access this resource' }
    );
  }

  await next();
}

/**
 * Authorize Middleware Factory
 * Checks if user has required role(s)
 * Returns 403 if user doesn't have permission
 * 
 * Usage:
 * app.get('/admin/users', protect, authorize('admin'), (c) => {
 *   return c.json({ message: 'Admin only route' });
 * });
 * 
 * app.get('/staff', protect, authorize(['admin', 'faculty']), (c) => {
 *   return c.json({ message: 'Admin or faculty only' });
 * });
 */
export function authorize(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (c: Context, next: Next) => {
    const user = c.get('user');

    // User should be authenticated (use with protect middleware)
    if (!user) {
      return errorResponse(
        c,
        'Authentication required',
        401,
        'UNAUTHORIZED'
      );
    }

    // Check if user has required role
    const userRole = (user as any).role || 'student';

    if (!roles.includes(userRole)) {
      return errorResponse(
        c,
        'Insufficient permissions',
        403,
        'FORBIDDEN',
        {
          message: `This resource requires one of the following roles: ${roles.join(', ')}`,
          userRole,
          requiredRoles: roles,
        }
      );
    }

    await next();
  };
}

/**
 * Require Admin Middleware
 * Convenience middleware for admin-only routes
 * Combines protect and authorize('admin')
 * 
 * Usage:
 * app.get('/admin/dashboard', requireAdmin, (c) => {
 *   return c.json({ message: 'Admin dashboard' });
 * });
 */
export async function requireAdmin(c: Context, next: Next) {
  const user = c.get('user');

  if (!user) {
    return errorResponse(
      c,
      'Authentication required',
      401,
      'UNAUTHORIZED'
    );
  }

  const userRole = (user as any).role || 'student';

  if (userRole !== 'admin') {
    return errorResponse(
      c,
      'Admin access required',
      403,
      'FORBIDDEN',
      {
        message: 'This resource is restricted to administrators only',
      }
    );
  }

  await next();
}

/**
 * Optional Auth Middleware
 * Injects user if authenticated, but doesn't require it
 * Useful for routes that have different behavior for authenticated vs anonymous users
 * 
 * Usage:
 * app.get('/posts', optionalAuth, (c) => {
 *   const user = c.get('user');
 *   if (user) {
 *     // Show personalized posts
 *   } else {
 *     // Show public posts
 *   }
 * });
 */
export const optionalAuth = injectUser;

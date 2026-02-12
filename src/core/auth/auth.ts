import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../database/client';
import * as schema from '../../modules/auth/auth.schema';

/**
 * Better Auth Server Instance
 * 
 * Configuration:
 * - Session-based authentication with secure HttpOnly cookies
 * - Email/Password authentication
 * - Drizzle ORM adapter for PostgreSQL
 * - Custom user fields (role, bitsId)
 */

export const auth = betterAuth({
  // Base URL - Required for Better Auth to work properly
  baseURL: process.env.BASE_URL || 'http://localhost:3000',

  // Secret key for signing tokens
  secret: process.env.BETTER_AUTH_SECRET || 'super-secret-key-change-in-production',

  // Database adapter
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),


  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production with email service
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  // Security settings
  advanced: {
    cookiePrefix: 'super-app',
    crossSubDomainCookies: {
      enabled: false,
    },
    useSecureCookies: true, // Force Secure for SameSite=None
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
    database: {
      // Let database generate UUIDs (using defaultRandom() in schema)
      generateId: () => undefined as any,
    },
  },

  // CORS and trusted origins
  trustedOrigins: [
    process.env.FRONTEND_URL,
    'http://localhost:3000', // Frontend dev
    'http://localhost:5173', // Vite default
  ].filter((url): url is string => !!url),

  // Custom user fields
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'student',
      },
      bitsId: {
        type: 'string',
        required: false,
      },
    },
  },
});

// Export types for use in middleware and routes
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.User;

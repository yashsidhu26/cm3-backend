import { createAuthClient } from 'better-auth/client';

/**
 * Better Auth Client
 * 
 * Usage in frontend:
 * 
 * import { authClient } from './auth/client';
 * 
 * // Sign up
 * await authClient.signUp.email({
 *   email: 'student@example.com',
 *   password: 'securepassword',
 *   name: 'John Doe',
 * });
 * 
 * // Sign in
 * await authClient.signIn.email({
 *   email: 'student@example.com',
 *   password: 'securepassword',
 * });
 * 
 * // Get session
 * const session = await authClient.getSession();
 * 
 * // Sign out
 * await authClient.signOut();
 */

export const authClient = createAuthClient({
  baseURL: process.env.API_URL || 'http://localhost:3000',
  
  // Credentials mode for cross-origin cookies
  fetchOptions: {
    credentials: 'include',
  },
});

// Export types for frontend TypeScript usage
export type { AuthSession, AuthUser } from './auth';

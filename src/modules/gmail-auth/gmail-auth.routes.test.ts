import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import gmailAuthRoutes from './gmail-auth.routes';
import * as service from './gmail-auth.service';

/**
 * Gmail Auth Routes Tests
 * Tests authentication requirements and user-scoped functionality
 */

describe('gmail-auth.routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/auth', gmailAuthRoutes);
  });

  describe('Authentication Requirements', () => {
    test('GET /auth/url returns 401 without authentication', async () => {
      const res = await app.request('/auth/url');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    test('GET /auth/status returns 401 without authentication', async () => {
      const res = await app.request('/auth/status');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    test('DELETE /auth/revoke returns 401 without authentication', async () => {
      const res = await app.request('/auth/revoke', { method: 'DELETE' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    test('GET /auth/email returns 401 without authentication', async () => {
      const res = await app.request('/auth/email');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    test('GET /auth/callback returns 401 without authentication', async () => {
      const res = await app.request('/auth/callback?code=test');
      expect(res.status).toBe(401);
    });
  });

  describe('Authenticated Routes', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test User' };

    // Helper to create authenticated request
    const createAuthenticatedApp = () => {
      const authApp = new Hono();
      // Mock the protect middleware to inject user
      authApp.use('*', async (c, next) => {
        c.set('user', mockUser);
        await next();
      });
      authApp.route('/auth', gmailAuthRoutes);
      return authApp;
    };

    test('GET /auth/url returns auth URL when authenticated', async () => {
      const authApp = createAuthenticatedApp();

      // Mock environment variables
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';

      const res = await authApp.request('/auth/url');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authUrl).toBeDefined();
      expect(body.authUrl).toContain('accounts.google.com');
    });

    test('GET /auth/status returns user-specific status when authenticated', async () => {
      const authApp = createAuthenticatedApp();

      // Mock getAuthStatus to return user-specific data
      const mockGetAuthStatus = mock(() => Promise.resolve({
        connected: true,
        email: 'user@gmail.com',
        scope: 'gmail.readonly gmail.modify',
      }));

      mock.module('./gmail-auth.service', () => ({
        ...service,
        getAuthStatus: mockGetAuthStatus,
      }));

      const res = await authApp.request('/auth/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connected).toBe(true);
      expect(body.email).toBe('user@gmail.com');
    });

    test('DELETE /auth/revoke calls service with correct user ID', async () => {
      const authApp = createAuthenticatedApp();

      const mockRevokeTokens = mock(() => Promise.resolve());
      mock.module('./gmail-auth.service', () => ({
        ...service,
        revokeTokens: mockRevokeTokens,
      }));

      const res = await authApp.request('/auth/revoke', { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockRevokeTokens).toHaveBeenCalledWith(mockUser.id);
    });

    test('GET /auth/email returns connected email for authenticated user', async () => {
      const authApp = createAuthenticatedApp();

      const mockGetGmailEmail = mock(() => Promise.resolve('user@gmail.com'));
      mock.module('./gmail-auth.service', () => ({
        ...service,
        getGmailEmail: mockGetGmailEmail,
      }));

      const res = await authApp.request('/auth/email');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.email).toBe('user@gmail.com');
      expect(mockGetGmailEmail).toHaveBeenCalledWith(mockUser.id);
    });

    test('GET /auth/callback associates tokens with authenticated user', async () => {
      const authApp = createAuthenticatedApp();

      const mockExchangeCodeForTokens = mock(() => Promise.resolve());
      mock.module('./gmail-auth.service', () => ({
        ...service,
        exchangeCodeForTokens: mockExchangeCodeForTokens,
      }));

      const res = await authApp.request('/auth/callback?code=test-code-123');
      expect(res.status).toBe(200);
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('test-code-123', mockUser.id);
    });
  });

  describe('User Isolation', () => {
    test('Different users get different tokens', async () => {
      const user1 = { id: 'user-1', email: 'user1@example.com', name: 'User 1' };
      const user2 = { id: 'user-2', email: 'user2@example.com', name: 'User 2' };

      const mockExchangeCodeForTokens = mock(() => Promise.resolve());
      mock.module('./gmail-auth.service', () => ({
        ...service,
        exchangeCodeForTokens: mockExchangeCodeForTokens,
      }));

      // User 1 authenticates
      const app1 = new Hono();
      app1.use('*', async (c, next) => {
        c.set('user', user1);
        await next();
      });
      app1.route('/auth', gmailAuthRoutes);

      await app1.request('/auth/callback?code=code-for-user1');
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('code-for-user1', user1.id);

      // User 2 authenticates
      const app2 = new Hono();
      app2.use('*', async (c, next) => {
        c.set('user', user2);
        await next();
      });
      app2.route('/auth', gmailAuthRoutes);

      await app2.request('/auth/callback?code=code-for-user2');
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith('code-for-user2', user2.id);

      // Verify different user IDs were used
      expect(user1.id).not.toBe(user2.id);
    });
  });
});

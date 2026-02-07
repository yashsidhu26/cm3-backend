import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { db } from '../../core/database/client';
import { gmailToken } from './gmail-auth.schema';
import { user } from '../../core/database/schema';
import { eq } from 'drizzle-orm';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getAuthStatus,
  revokeTokens,
  getGmailEmail,
  getAuthenticatedClient,
} from './gmail-auth.service';
import { randomUUID } from 'crypto';

/**
 * Gmail Auth Service Tests
 * Tests encryption, database operations, and user-scoped token management
 */

describe('gmail-auth.service', () => {
  const testUserId = randomUUID();
  const testUserId2 = randomUUID();

  // Create test users before each test
  beforeEach(async () => {
    try {
      await db.insert(user).values({
        id: testUserId,
        name: 'Test User 1',
        email: 'testuser1@example.com',
        emailVerified: true,
      });
      await db.insert(user).values({
        id: testUserId2,
        name: 'Test User 2',
        email: 'testuser2@example.com',
        emailVerified: true,
      });
    } catch (e) {
      // Ignore if users already exist
    }
  });

  // Cleanup after each test
  afterEach(async () => {
    try {
      await db.delete(gmailToken).where(eq(gmailToken.userId, testUserId));
      await db.delete(gmailToken).where(eq(gmailToken.userId, testUserId2));
      await db.delete(user).where(eq(user.id, testUserId));
      await db.delete(user).where(eq(user.id, testUserId2));
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Environment Configuration', () => {
    test('getAuthUrl throws when env vars missing', () => {
      const savedId = process.env.GMAIL_CLIENT_ID;
      const savedSecret = process.env.GMAIL_CLIENT_SECRET;
      const savedUri = process.env.GMAIL_REDIRECT_URI;

      delete process.env.GMAIL_CLIENT_ID;
      delete process.env.GMAIL_CLIENT_SECRET;
      delete process.env.GMAIL_REDIRECT_URI;

      expect(() => getAuthUrl()).toThrow(/Missing GMAIL_/);

      // Restore
      if (savedId) process.env.GMAIL_CLIENT_ID = savedId;
      if (savedSecret) process.env.GMAIL_CLIENT_SECRET = savedSecret;
      if (savedUri) process.env.GMAIL_REDIRECT_URI = savedUri;
    });

    test('getAuthUrl returns valid URL when env vars set', () => {
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';

      const url = getAuthUrl();
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('scope=');
      expect(url).toContain('gmail.readonly');
      expect(url).toContain('gmail.modify');
      expect(url).toContain('access_type=offline');
    });
  });

  describe('User-Scoped Token Storage', () => {
    test('getAuthStatus returns not connected for new user', async () => {
      const status = await getAuthStatus(testUserId);
      expect(status.connected).toBe(false);
      expect(status.email).toBeUndefined();
    });

    test('tokens are isolated per user', async () => {
      // Manually insert tokens for two different users
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'encrypted-token-user1',
        encryptedRefreshToken: 'encrypted-refresh-user1',
        email: 'user1@gmail.com',
        scope: 'gmail.readonly',
      });

      await db.insert(gmailToken).values({
        userId: testUserId2,
        encryptedAccessToken: 'encrypted-token-user2',
        encryptedRefreshToken: 'encrypted-refresh-user2',
        email: 'user2@gmail.com',
        scope: 'gmail.readonly',
      });

      // Verify each user gets their own data
      const status1 = await getAuthStatus(testUserId);
      const status2 = await getAuthStatus(testUserId2);

      expect(status1.connected).toBe(true);
      expect(status1.email).toBe('user1@gmail.com');

      expect(status2.connected).toBe(true);
      expect(status2.email).toBe('user2@gmail.com');

      // Verify they're different
      expect(status1.email).not.toBe(status2.email);
    });

    test('revokeTokens only removes tokens for specific user', async () => {
      // Insert tokens for two users
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'token1',
        email: 'user1@gmail.com',
      });

      await db.insert(gmailToken).values({
        userId: testUserId2,
        encryptedAccessToken: 'token2',
        email: 'user2@gmail.com',
      });

      // Revoke for user 1
      await revokeTokens(testUserId);

      // Verify user 1 is disconnected
      const status1 = await getAuthStatus(testUserId);
      expect(status1.connected).toBe(false);

      // Verify user 2 still has tokens
      const status2 = await getAuthStatus(testUserId2);
      expect(status2.connected).toBe(true);
      expect(status2.email).toBe('user2@gmail.com');
    });

    test('getGmailEmail returns correct email for user', async () => {
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'token',
        email: 'myemail@gmail.com',
      });

      const email = await getGmailEmail(testUserId);
      expect(email).toBe('myemail@gmail.com');
    });

    test('getGmailEmail returns null for user without tokens', async () => {
      const email = await getGmailEmail(testUserId);
      expect(email).toBeNull();
    });
  });

  describe('Token Encryption', () => {
    test('tokens are encrypted in database', async () => {
      // This test requires ENCRYPTION_KEY to be set
      if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
        console.warn('Skipping encryption test - ENCRYPTION_KEY not set');
        return;
      }

      // Use the service to exchange code for tokens (which should trigger encryption)
      await exchangeCodeForTokens('mock-code', testUserId);

      // Read directly from database
      const record = await db.query.gmailToken.findFirst({
        where: eq(gmailToken.userId, testUserId),
      });

      // Verify tokens are stored in encrypted format (contains colons from iv:authTag:encrypted)
      expect(record?.encryptedAccessToken).toContain(':');
      expect(record?.encryptedRefreshToken).toContain(':');

      // Verify they are not the mock values from test-setup.ts
      expect(record?.encryptedAccessToken).not.toBe('mock-access-token');
      expect(record?.encryptedRefreshToken).not.toBe('mock-refresh-token');
    });
  });

  describe('Database Constraints', () => {
    test('one user can only have one Gmail connection (unique constraint)', async () => {
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'token1',
        email: 'first@gmail.com',
      });

      // Attempting to insert another token for the same user should fail
      try {
        await db.insert(gmailToken).values({
          userId: testUserId,
          encryptedAccessToken: 'token2',
          email: 'second@gmail.com',
        });
        // If we get here, the test should fail
        expect(true).toBe(false); // Force failure
      } catch (error: any) {
        // Verify it's a unique constraint violation
        expect(error.code).toBe('23505'); // PostgreSQL unique violation code
      }
    });

    test('updating tokens for same user works (upsert behavior)', async () => {
      // First insert
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'old-token',
        email: 'old@gmail.com',
      });

      // Update
      await db.update(gmailToken)
        .set({
          encryptedAccessToken: 'new-token',
          email: 'new@gmail.com',
          updatedAt: new Date(),
        })
        .where(eq(gmailToken.userId, testUserId));

      // Verify update worked
      const status = await getAuthStatus(testUserId);
      expect(status.email).toBe('new@gmail.com');

      // Verify only one record exists
      const records = await db.query.gmailToken.findMany({
        where: eq(gmailToken.userId, testUserId),
      });
      expect(records.length).toBe(1);
    });
  });

  describe('getAuthenticatedClient', () => {
    test('returns null for user without tokens', async () => {
      const client = await getAuthenticatedClient(testUserId);
      expect(client).toBeNull();
    });

    test('returns OAuth2 client for user with tokens', async () => {
      // Set up environment
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';

      // Insert valid-looking tokens
      await db.insert(gmailToken).values({
        userId: testUserId,
        encryptedAccessToken: 'access-token',
        encryptedRefreshToken: 'refresh-token',
        email: 'test@gmail.com',
      });

      const client = await getAuthenticatedClient(testUserId);
      expect(client).not.toBeNull();
      expect(client).toBeDefined();
    });
  });
});

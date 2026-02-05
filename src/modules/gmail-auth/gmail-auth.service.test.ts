import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  getAuthUrl,
  getAuthStatus,
  setTokens,
  getTokens,
  exchangeCodeForTokens,
  clearTokenStoreForTesting,
  type AuthStatus,
} from './gmail-auth.service';

describe('gmail-auth.service', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearTokenStoreForTesting();
    savedEnv.GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
    savedEnv.GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    savedEnv.GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;
  });

  afterEach(() => {
    if (savedEnv.GMAIL_CLIENT_ID !== undefined) process.env.GMAIL_CLIENT_ID = savedEnv.GMAIL_CLIENT_ID;
    else delete process.env.GMAIL_CLIENT_ID;
    if (savedEnv.GMAIL_CLIENT_SECRET !== undefined) process.env.GMAIL_CLIENT_SECRET = savedEnv.GMAIL_CLIENT_SECRET;
    else delete process.env.GMAIL_CLIENT_SECRET;
    if (savedEnv.GMAIL_REDIRECT_URI !== undefined) process.env.GMAIL_REDIRECT_URI = savedEnv.GMAIL_REDIRECT_URI;
    else delete process.env.GMAIL_REDIRECT_URI;
  });

  describe('getAuthStatus', () => {
    test('returns correct shape', () => {
      const status = getAuthStatus();
      expect(status).toBeDefined();
      expect(typeof status.tokensStored).toBe('boolean');
      expect(typeof status.envTokenPresent).toBe('boolean');
      expect(['memory', 'file', 'redis']).toContain(status.storageType);
      expect(typeof status.storageConnected).toBe('boolean');
    });

    test('envTokenPresent is false when env vars missing', () => {
      delete process.env.GMAIL_CLIENT_ID;
      delete process.env.GMAIL_CLIENT_SECRET;
      delete process.env.GMAIL_REDIRECT_URI;
      const status = getAuthStatus();
      expect(status.envTokenPresent).toBe(false);
    });

    test('envTokenPresent is true when all env vars set', () => {
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      const status = getAuthStatus();
      expect(status.envTokenPresent).toBe(true);
    });

    test('tokensStored is true after setTokens', async () => {
      process.env.GMAIL_CLIENT_ID = 'x';
      process.env.GMAIL_CLIENT_SECRET = 'y';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost/auth/callback';
      await setTokens('default', { access_token: 'at', refresh_token: 'rt' });
      const status = getAuthStatus();
      expect(status.tokensStored).toBe(true);
    });
  });

  describe('getAuthUrl', () => {
    test('throws when env vars missing', () => {
      delete process.env.GMAIL_CLIENT_ID;
      delete process.env.GMAIL_CLIENT_SECRET;
      delete process.env.GMAIL_REDIRECT_URI;
      expect(() => getAuthUrl()).toThrow(/Missing GMAIL_/);
    });

    test('returns URL containing accounts.google.com when env set', () => {
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

  describe('setTokens and getTokens', () => {
    test('stores and retrieves tokens for default user', async () => {
      await setTokens('default', {
        access_token: 'at1',
        refresh_token: 'rt1',
        expiry_date: 12345,
      });
      const got = await getTokens('default');
      expect(got).not.toBeNull();
      expect(got!.access_token).toBe('at1');
      expect(got!.refresh_token).toBe('rt1');
      expect(got!.expiry_date).toBe(12345);
    });

    test('getTokens returns null for unknown user when store empty', async () => {
      const got = await getTokens('unknown');
      expect(got).toBeNull();
    });
  });

  describe('exchangeCodeForTokens', () => {
    test('stores tokens when code exchanged (with mock)', async () => {
      process.env.GMAIL_CLIENT_ID = 'test-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      await exchangeCodeForTokens('any-code');
      const tokens = await getTokens('default');
      expect(tokens).not.toBeNull();
      expect(tokens!.access_token).toBeDefined();
      expect(tokens!.refresh_token).toBeDefined();
    });
  });
});

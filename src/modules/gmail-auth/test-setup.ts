/**
 * Test setup: mock googleapis so tests don't require network or full dependency chain.
 * Run with: bun test src/modules/gmail-auth --preload ./src/modules/gmail-auth/test-setup.ts
 */
import { mock } from 'bun:test';

// Set required environment variables for tests
process.env.GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || 'test-client-id';
process.env.GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'test-client-secret';
process.env.GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/callback';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(32); // 32 chars for AES-256

class MockOAuth2 {
  private credentials: any;

  generateAuthUrl() {
    return 'https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/gmail.readonly+https://www.googleapis.com/auth/gmail.modify&access_type=offline';
  }

  getToken(_code: string) {
    return Promise.resolve({
      tokens: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expiry_date: Date.now() + 3600000,
      },
    });
  }

  setCredentials(credentials: any) {
    this.credentials = credentials;
  }

  revokeToken(_token: string) {
    return Promise.resolve();
  }

  on(_event: string, _callback: Function) {
    // Dummy event listener
  }
}

mock.module('googleapis', () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
    gmail: () => ({
      users: {
        getProfile: () => Promise.resolve({ data: { emailAddress: 'test@example.com' } }),
      },
    }),
  },
}));

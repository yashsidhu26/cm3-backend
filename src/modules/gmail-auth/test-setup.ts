/**
 * Test setup: mock googleapis so tests don't require network or full dependency chain.
 * Run with: bun test src/modules/gmail-auth --preload ./src/modules/gmail-auth/test-setup.ts
 */
import { mock } from 'bun:test';

class MockOAuth2 {
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
}

mock.module('googleapis', () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

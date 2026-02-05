import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import gmailAuthRoutes from './gmail-auth.routes';
import { clearTokenStoreForTesting } from './gmail-auth.service';

describe('gmail-auth.routes', () => {
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

  test('GET /url returns 500 when env missing', async () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REDIRECT_URI;
    const res = await gmailAuthRoutes.request('http://localhost/url');
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBeDefined();
  });

  test('GET /url returns authUrl when env set', async () => {
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-secret';
    process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
    const res = await gmailAuthRoutes.request('http://localhost/url');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { authUrl?: string };
    expect(data.authUrl).toBeDefined();
    expect(data.authUrl).toContain('accounts.google.com');
  });

  test('GET /status returns JSON with required fields', async () => {
    const res = await gmailAuthRoutes.request('http://localhost/status');
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      tokensStored?: boolean;
      envTokenPresent?: boolean;
      storageType?: string;
      storageConnected?: boolean;
    };
    expect(typeof data.tokensStored).toBe('boolean');
    expect(typeof data.envTokenPresent).toBe('boolean');
    expect(data.storageType).toBeDefined();
    expect(typeof data.storageConnected).toBe('boolean');
  });

  test('GET /callback without code returns 400 and HTML', async () => {
    const res = await gmailAuthRoutes.request('http://localhost/callback');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Missing code');
    expect(html).toContain('gmail-auth-done');
  });

  test('GET /callback with code exchanges and returns success HTML (mock)', async () => {
    process.env.GMAIL_CLIENT_ID = 'test-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-secret';
    process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
    const res = await gmailAuthRoutes.request('http://localhost/callback?code=any-code');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Gmail authorized');
    expect(html).toContain('gmail-auth-done');
  });

  test('GET / returns login page HTML', async () => {
    const res = await gmailAuthRoutes.request('http://localhost:3000/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Gmail 1-Click Login');
    expect(html).toContain('Authorize Gmail');
    expect(html).toContain("'/status'");
    expect(html).toContain("'/url'");
    expect(html).toContain('gmail-auth-done');
  });
});

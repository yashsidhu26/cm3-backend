import { Hono } from 'hono';
import { protect } from '../../core/auth/middleware';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getAuthStatus,
  revokeTokens,
  getGmailEmail,
} from './gmail-auth.service';

/**
 * Gmail Auth Routes - Production Implementation
 * All routes require user authentication
 * Tokens are stored per-user in the database
 */

const gmailAuthRoutes = new Hono();

/**
 * GET /auth/url
 * Returns Google OAuth2 authorization URL for Gmail
 * Requires authentication
 */
gmailAuthRoutes.get('/url', protect, (c) => {
  try {
    const authUrl = getAuthUrl();
    return c.json({ authUrl });
  } catch (e: any) {
    return c.json(
      {
        error: e?.message || 'Missing Gmail OAuth env (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI)',
        code: 'OAUTH_CONFIG_ERROR'
      },
      500
    );
  }
});

/**
 * GET /auth/callback?code=...
 * OAuth callback: exchange code for tokens, store them for the authenticated user
 * Requires authentication
 */
gmailAuthRoutes.get('/callback', protect, async (c) => {
  const code = c.req.query('code');
  const user = c.get('user');

  if (!code) {
    return c.html(
      `<!DOCTYPE html><html><head><title>Auth Failed</title></head><body><p>Missing authorization code.</p><script>if (window.opener) { window.opener.postMessage({ type: 'gmail-auth-done', success: false, error: 'missing_code' }, '*'); window.close(); }</script></body></html>`,
      400
    );
  }

  try {
    await exchangeCodeForTokens(code, user!.id);

    return c.html(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Gmail Authorized</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .container { text-align: center; padding: 2rem; background: rgba(255, 255, 255, 0.1); border-radius: 16px; backdrop-filter: blur(10px); }
    h1 { margin: 0 0 1rem 0; font-size: 2rem; }
    p { margin: 0; opacity: 0.9; }
    .checkmark { font-size: 4rem; margin-bottom: 1rem; animation: scaleIn 0.3s ease-out; }
    @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✅</div>
    <h1>Gmail Connected!</h1>
    <p>You can close this window and return to the app.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail-auth-done', success: true }, '*');
      setTimeout(() => window.close(), 1500);
    }
  </script>
</body>
</html>`
    );
  } catch (e: any) {
    console.error('[gmail-auth] Callback error:', e);
    return c.html(
      `<!DOCTYPE html><html><head><title>Auth Failed</title></head><body><p>Error: ${escapeHtml(e?.message || 'Unknown error')}</p><script>if (window.opener) { window.opener.postMessage({ type: 'gmail-auth-done', success: false, error: 'exchange_failed' }, '*'); window.close(); }</script></body></html>`,
      500
    );
  }
});

/**
 * GET /auth/status
 * Returns Gmail connection status for the authenticated user
 * Requires authentication
 */
gmailAuthRoutes.get('/status', protect, async (c) => {
  const user = c.get('user');

  try {
    const status = await getAuthStatus(user!.id);
    return c.json(status);
  } catch (e: any) {
    console.error('[gmail-auth] Status error:', e);
    return c.json({ error: 'Failed to get status', code: 'STATUS_ERROR' }, 500);
  }
});

/**
 * DELETE /auth/revoke
 * Revoke Gmail access and remove tokens from database
 * Requires authentication
 */
gmailAuthRoutes.delete('/revoke', protect, async (c) => {
  const user = c.get('user');

  try {
    await revokeTokens(user!.id);
    return c.json({ success: true, message: 'Gmail access revoked' });
  } catch (e: any) {
    console.error('[gmail-auth] Revoke error:', e);
    return c.json({ error: 'Failed to revoke access', code: 'REVOKE_ERROR' }, 500);
  }
});

/**
 * GET /auth/email
 * Get the connected Gmail email address
 * Requires authentication
 */
gmailAuthRoutes.get('/email', protect, async (c) => {
  const user = c.get('user');

  try {
    const email = await getGmailEmail(user!.id);

    if (!email) {
      return c.json({ error: 'No Gmail account connected', code: 'NOT_CONNECTED' }, 404);
    }

    return c.json({ email });
  } catch (e: any) {
    console.error('[gmail-auth] Email error:', e);
    return c.json({ error: 'Failed to get email', code: 'EMAIL_ERROR' }, 500);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default gmailAuthRoutes;

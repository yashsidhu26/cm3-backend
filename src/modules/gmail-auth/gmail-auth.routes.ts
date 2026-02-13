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
 * GET /auth/url (Legacy)
 * GET /auth/gmail/connect (New)
 * Returns Google OAuth2 authorization URL for Gmail
 * Requires authentication
 */
const getAuthUrlHandler = (c: any) => {
  try {
    const authUrl = getAuthUrl();
    return c.json({ success: true, data: { url: authUrl } });
  } catch (e: any) {
    return c.json(
      {
        success: false,
        error: {
          message: e?.message || 'Missing Gmail OAuth env (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)',
          code: 'OAUTH_CONFIG_ERROR'
        }
      },
      500
    );
  }
};

gmailAuthRoutes.get('/url', protect, getAuthUrlHandler);
gmailAuthRoutes.get('/gmail/connect', protect, getAuthUrlHandler);

/**
 * GET /auth/callback?code=... (Legacy)
 * GET /auth/gmail/callback?code=... (New)
 * OAuth callback: exchange code for tokens, store them for the authenticated user
 * Requires authentication
 */
const callbackHandler = async (c: any) => {
  const code = c.req.query('code');
  const user = c.get('user');

  // Get frontend URL from env (required)
  const FRONTEND_URL = process.env.FRONTEND_URL;

  if (!FRONTEND_URL) {
    console.error('[Gmail Auth] FRONTEND_URL not set in environment variables');
    return c.json({ success: false, error: 'Server configuration error' }, 500);
  }

  if (!code) {
    // Redirect to frontend with error
    return c.redirect(`${FRONTEND_URL}?gmail_auth=failed&error=missing_code`);
  }

  try {
    await exchangeCodeForTokens(code, user!.id);

    // Redirect to frontend with success
    return c.redirect(`${FRONTEND_URL}?gmail_auth=success`);
  } catch (e: any) {
    console.error('[gmail-auth] Callback error:', e);

    // Redirect to frontend with error
    const errorMsg = encodeURIComponent(e?.message || 'Unknown error');
    return c.redirect(`${FRONTEND_URL}?gmail_auth=failed&error=${errorMsg}`);
  }
};

gmailAuthRoutes.get('/callback', protect, callbackHandler);
gmailAuthRoutes.get('/gmail/callback', protect, callbackHandler);

/**
 * GET /auth/status (Legacy)
 * GET /auth/gmail/status (New)
 * Returns Gmail connection status for the authenticated user
 * Requires authentication
 */
const statusHandler = async (c: any) => {
  const user = c.get('user');

  try {
    const status = await getAuthStatus(user!.id);
    return c.json({ success: true, data: status });
  } catch (e: any) {
    console.error('[gmail-auth] Status error:', e);
    return c.json({
      success: false,
      error: { message: 'Failed to get status', code: 'STATUS_ERROR' }
    }, 500);
  }
};

gmailAuthRoutes.get('/status', protect, statusHandler);
gmailAuthRoutes.get('/gmail/status', protect, statusHandler);

/**
 * DELETE /auth/revoke (Legacy)
 * POST /auth/gmail/disconnect (New)
 * Revoke Gmail access and remove tokens from database
 * Requires authentication
 */
const revokeHandler = async (c: any) => {
  const user = c.get('user');

  try {
    await revokeTokens(user!.id);
    return c.json({
      success: true,
      data: { message: 'Gmail access revoked' }
    });
  } catch (e: any) {
    console.error('[gmail-auth] Revoke error:', e);
    return c.json({
      success: false,
      error: { message: 'Failed to revoke access', code: 'REVOKE_ERROR' }
    }, 500);
  }
};

gmailAuthRoutes.delete('/revoke', protect, revokeHandler);
gmailAuthRoutes.post('/gmail/disconnect', protect, revokeHandler);

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

/**
 * GET /auth/debug-env
 * Debug endpoint to check environment variables (remove in production)
 */
gmailAuthRoutes.get('/debug-env', async (c) => {
  const baseUrl = process.env.BASE_URL;
  const frontendUrl = process.env.FRONTEND_URL;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${baseUrl}/auth/callback`;

  return c.json({
    BASE_URL: baseUrl || '(not set)',
    FRONTEND_URL: frontendUrl || '(not set)',
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || '(auto-derived)',
    computed_redirect_uri: redirectUri,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ? '(set)' : '(not set)',
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? '(set)' : '(not set)',
  });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default gmailAuthRoutes;

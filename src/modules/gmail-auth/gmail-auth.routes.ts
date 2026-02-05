import { Hono } from 'hono';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getAuthStatus,
} from './gmail-auth.service';

const gmailAuthRoutes = new Hono();

/**
 * GET /auth/url
 * Returns Google OAuth2 authorization URL for Gmail (offline, gmail.readonly + gmail.modify).
 */
gmailAuthRoutes.get('/url', (c) => {
  try {
    const authUrl = getAuthUrl();
    return c.json({ authUrl });
  } catch (e: any) {
    return c.json(
      { error: e?.message || 'Missing Gmail OAuth env (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI)' },
      500
    );
  }
});

/**
 * GET /auth/callback?code=...
 * OAuth callback: exchange code for tokens, store them, return HTML success page.
 */
gmailAuthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.html(
      `<!DOCTYPE html><html><head><title>Auth Failed</title></head><body><p>Missing code.</p><script>if (window.opener) { window.opener.postMessage({ type: 'gmail-auth-done', success: false }, '*'); window.close(); }</script></body></html>`,
      400
    );
  }
  try {
    await exchangeCodeForTokens(code);
    const baseUrl = new URL(c.req.url).origin;
    return c.html(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Gmail Authorized</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    h1 { color: #0f9d58; }
    p { color: #333; }
  </style>
</head>
<body>
  <h1>✅ Gmail authorized</h1>
  <p>You can close this window and return to the app.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail-auth-done', success: true }, '*');
      window.close();
    } else {
      document.body.innerHTML += '<p><a href="${baseUrl}/auth">Back to app</a></p>';
    }
  </script>
</body>
</html>`
    );
  } catch (e: any) {
    return c.html(
      `<!DOCTYPE html><html><head><title>Auth Failed</title></head><body><p>Error: ${escapeHtml(e?.message || 'Unknown')}</p><script>if (window.opener) { window.opener.postMessage({ type: 'gmail-auth-done', success: false }, '*'); window.close(); }</script></body></html>`,
      500
    );
  }
});

/**
 * GET /auth/status
 * Returns tokensStored, envTokenPresent, storageType, storageConnected.
 */
gmailAuthRoutes.get('/status', (c) => {
  const status = getAuthStatus();
  return c.json(status);
});

/**
 * GET /auth
 * Serves the 1-click Gmail login page (button + status indicator + optional polling).
 */
gmailAuthRoutes.get('/', (c) => {
  const base = new URL(c.req.url).origin;
  const authBase = `${base}/auth`;
  return c.html(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gmail 1-Click Login</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .status { padding: 0.5rem 0.75rem; border-radius: 8px; margin: 1rem 0; }
    .status.authorized { background: #e6f4ea; color: #0f9d58; }
    .status.not-authorized { background: #fef7e0; color: #b36b00; }
    button { background: #1a73e8; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #1765cc; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .sync-section { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; }
    .sync-section p { color: #5f6368; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Gmail 1-Click Login</h1>
  <div id="status" class="status not-authorized">⚠️ Not Authorized</div>
  <button id="btn-auth" type="button">🔑 Authorize Gmail</button>

  <div class="sync-section">
    <p id="sync-msg">Authorize Gmail first to use Sync.</p>
    <button id="btn-sync" type="button" disabled>Sync Gmail</button>
  </div>

  <script>
    const authBase = '${authBase}';
    const statusEl = document.getElementById('status');
    const btnAuth = document.getElementById('btn-auth');
    const btnSync = document.getElementById('btn-sync');
    const syncMsg = document.getElementById('sync-msg');

    function setAuthorized(ok) {
      if (ok) {
        statusEl.textContent = '✅ Authorized';
        statusEl.className = 'status authorized';
        btnSync.disabled = false;
        syncMsg.textContent = 'You can sync Gmail now.';
      } else {
        statusEl.textContent = '⚠️ Not Authorized';
        statusEl.className = 'status not-authorized';
        btnSync.disabled = true;
        syncMsg.textContent = 'Authorize Gmail first to use Sync.';
      }
    }

    async function fetchStatus() {
      const res = await fetch(authBase + '/status');
      return res.ok ? res.json() : null;
    }

    async function updateStatus() {
      const s = await fetchStatus();
      if (s) setAuthorized(s.tokensStored || s.envTokenPresent);
    }

    btnAuth.addEventListener('click', async () => {
      try {
        const res = await fetch(authBase + '/url');
        const data = await res.json();
        if (!data.authUrl) throw new Error('No auth URL');
        const popup = window.open(data.authUrl, '_blank', 'width=600,height=700');
        if (popup) {
          const interval = setInterval(async () => {
            if (popup.closed) { clearInterval(interval); return; }
            const s = await fetchStatus();
            if (s && (s.tokensStored || s.envTokenPresent)) {
              clearInterval(interval);
              popup.close();
              setAuthorized(true);
            }
          }, 2000);
        } else {
          window.location.href = data.authUrl;
        }
      } catch (e) {
        alert('Failed to get auth URL: ' + (e.message || e));
      }
    });

    btnSync.addEventListener('click', () => {
      alert('Sync Gmail: wire this to your main app action (e.g. call your sync API).');
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'gmail-auth-done' && e.data.success) setAuthorized(true);
    });

    updateStatus();
  </script>
</body>
</html>`
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default gmailAuthRoutes;

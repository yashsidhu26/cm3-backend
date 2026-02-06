# Gmail Auth API - Integration Guide

## Overview

The Gmail Auth module provides secure OAuth2 authentication for Gmail API access. All tokens are encrypted and stored per-user in the database.

## Prerequisites

### Environment Variables

Add these to your `.env` file:

```bash
# Gmail OAuth2 Credentials (from Google Cloud Console)
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REDIRECT_URI=http://localhost:3000/auth/callback

# Token Encryption Key (32+ characters, keep secret!)
ENCRYPTION_KEY=your_secure_random_key_here_minimum_32_chars
```

### Database Migration

Run the migration to create the `gmail_token` table:

```bash
bun run db:generate
bun run db:migrate
```

---

## API Endpoints

All endpoints require user authentication (session cookie).

### `GET /auth/url`

Get the OAuth2 authorization URL to redirect users to Google's consent screen.

**Request:**
```bash
curl -X GET http://localhost:3000/auth/url \
  -H "Cookie: session=your_session_cookie"
```

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Frontend Integration:**
```typescript
// Open popup for OAuth flow
const response = await fetch('/auth/url');
const { authUrl } = await response.json();

const popup = window.open(authUrl, '_blank', 'width=600,height=700');

// Listen for completion
window.addEventListener('message', (event) => {
  if (event.data.type === 'gmail-auth-done' && event.data.success) {
    console.log('Gmail connected!');
    // Refresh UI, fetch status, etc.
  }
});
```

---

### `GET /auth/callback?code=...`

OAuth2 callback endpoint. Google redirects here after user grants permission.

**Note:** This is called automatically by Google. Your frontend should not call this directly.

**Response:** HTML page that posts a message to the opener window and auto-closes.

---

### `GET /auth/status`

Check if the current user has connected their Gmail account.

**Request:**
```bash
curl -X GET http://localhost:3000/auth/status \
  -H "Cookie: session=your_session_cookie"
```

**Response (Connected):**
```json
{
  "connected": true,
  "email": "user@gmail.com",
  "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify"
}
```

**Response (Not Connected):**
```json
{
  "connected": false
}
```

---

### `GET /auth/email`

Get the Gmail email address associated with the current user's connection.

**Request:**
```bash
curl -X GET http://localhost:3000/auth/email \
  -H "Cookie: session=your_session_cookie"
```

**Response:**
```json
{
  "email": "user@gmail.com"
}
```

**Error (Not Connected):**
```json
{
  "error": "No Gmail account connected",
  "code": "NOT_CONNECTED"
}
```

---

### `DELETE /auth/revoke`

Disconnect Gmail and remove all stored tokens.

**Request:**
```bash
curl -X DELETE http://localhost:3000/auth/revoke \
  -H "Cookie: session=your_session_cookie"
```

**Response:**
```json
{
  "success": true,
  "message": "Gmail access revoked"
}
```

---

## Frontend Integration Example

### React Component

```typescript
import { useState, useEffect } from 'react';

export function GmailConnect() {
  const [status, setStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    const res = await fetch('/auth/status');
    const data = await res.json();
    setStatus(data);
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/auth/url');
      const { authUrl } = await res.json();
      
      const popup = window.open(authUrl, '_blank', 'width=600,height=700');
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'gmail-auth-done') {
          if (event.data.success) {
            fetchStatus(); // Refresh status
          }
          window.removeEventListener('message', handleMessage);
          setLoading(false);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Fallback: check if popup was closed without message
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
          setLoading(false);
          fetchStatus();
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to connect Gmail:', error);
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Gmail?')) return;
    
    setLoading(true);
    try {
      await fetch('/auth/revoke', { method: 'DELETE' });
      fetchStatus();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return <div>Loading...</div>;

  return (
    <div>
      {status.connected ? (
        <div>
          <p>✅ Connected: {status.email}</p>
          <button onClick={handleDisconnect} disabled={loading}>
            Disconnect Gmail
          </button>
        </div>
      ) : (
        <div>
          <p>⚠️ Gmail not connected</p>
          <button onClick={handleConnect} disabled={loading}>
            Connect Gmail
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Security Features

1. **Token Encryption**: All OAuth tokens are encrypted using AES-256-GCM before storage
2. **User Isolation**: Tokens are scoped per user (one-to-one relationship)
3. **Automatic Refresh**: Access tokens are automatically refreshed when expired
4. **Secure Revocation**: Tokens are revoked with Google and removed from database
5. **Authentication Required**: All endpoints require valid user session

---

## Using Gmail API in Other Services

To use the Gmail API in your backend services:

```typescript
import { getAuthenticatedClient } from './modules/gmail-auth/gmail-auth.service';
import { google } from 'googleapis';

// In your service/route handler
const userId = c.get('user')!.id;
const auth = await getAuthenticatedClient(userId);

if (!auth) {
  return c.json({ error: 'Gmail not connected' }, 400);
}

// Use the authenticated client
const gmail = google.gmail({ version: 'v1', auth });
const messages = await gmail.users.messages.list({
  userId: 'me',
  maxResults: 10,
});

return c.json(messages.data);
```

---

## Troubleshooting

### "Missing GMAIL_CLIENT_ID" Error
- Ensure all environment variables are set in `.env`
- Restart the server after adding env vars

### "ENCRYPTION_KEY not set" Warning
- Add a secure random key (32+ characters) to `.env`
- Generate one: `openssl rand -base64 32`

### Tokens Not Persisting
- Check database connection
- Verify `gmail_token` table exists
- Check server logs for database errors

### OAuth Callback Fails
- Verify `GMAIL_REDIRECT_URI` matches Google Cloud Console
- Ensure user is authenticated before starting OAuth flow
- Check browser console for CORS errors

# Streaming Endpoint Troubleshooting Guide

## Error: "Failed to initialize stream"

This error occurs in the outer try-catch before streaming starts. Common causes:

### 1. Check Request Format

**Required fields**:
```json
{
  "query": "Your question here",      // Required, min 1 char, max 2000
  "includeHistory": true,             // Optional, defaults to true
  "format": "text"                    // Optional: "text" | "json" | "schedule" | "overview"
}
```

### 2. Frontend URL vs Backend URL

**Common mistake**: Calling frontend URL instead of backend

❌ **Wrong**:
```javascript
fetch('http://localhost:8080/api/ai-integration/chat-stream', ...)
```

✅ **Correct**:
```javascript
fetch('http://localhost:3000/api/ai-integration/chat-stream', ...)
```

### 3. Frontend Proxy Configuration

If your frontend is on port 8080 and uses relative URLs, you need a proxy:

#### Vite (vite.config.ts)
```typescript
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // IMPORTANT for SSE
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
    },
  },
};
```

#### Next.js (next.config.js)
```javascript
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};
```

#### Create React App (package.json)
```json
{
  "proxy": "http://localhost:3000"
}
```

### 4. Authentication Required

The endpoint requires authentication. You need a valid session cookie:

```javascript
fetch('/api/ai-integration/chat-stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  },
  credentials: 'include', // IMPORTANT: Include cookies
  body: JSON.stringify({
    query: 'What is 2+2?',
    format: 'text',
  }),
});
```

### 5. CORS Issues

Make sure your frontend URL is in the allowed origins:

**Backend .env**:
```bash
FRONTEND_URL=http://localhost:8080
```

**Backend CORS config** (already configured in src/app.ts):
```typescript
app.use('*', cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
  ].filter((url): url is string => !!url),
  credentials: true, // Allow cookies
}));
```

---

## Testing the Endpoint

### Test 1: Direct Backend Call (No Auth)
```bash
curl -N -X POST http://localhost:3000/api/ai-integration/chat-stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query":"What is 2+2?","format":"text"}'
```

**Expected**: Returns 401 Unauthorized (endpoint exists, auth required)

### Test 2: With Authentication
```bash
# Get your session token from browser DevTools → Application → Cookies
SESSION_TOKEN="your-session-token-here"

curl -N -X POST http://localhost:3000/api/ai-integration/chat-stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Cookie: super-app.session_token=$SESSION_TOKEN" \
  -d '{"query":"What is 2+2?","format":"text"}'
```

**Expected**: Streaming events start appearing

### Test 3: Browser Console
```javascript
// Open DevTools Console on your frontend (port 8080)
const response = await fetch('/api/ai-integration/chat-stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  },
  credentials: 'include',
  body: JSON.stringify({
    query: 'What is 2+2?',
    format: 'text'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```

---

## Common Errors & Solutions

### Error: "STREAM_INIT_ERROR"
**Cause**: Something failed before streaming started
**Check**:
1. Server logs for detailed error message
2. Request format matches schema
3. User is authenticated

### Error: "User not authenticated"
**Solution**:
```javascript
credentials: 'include' // Add this to fetch options
```

### Error: "Query cannot be empty"
**Solution**:
```json
{
  "query": "Your question here" // Must be at least 1 character
}
```

### Error: 404 Not Found
**Causes**:
1. Calling wrong URL (frontend URL instead of backend)
2. Proxy not configured
3. Endpoint path typo

**Solution**:
- Check URL: Should be `/api/ai-integration/chat-stream`
- Configure proxy (see above)
- Verify backend is running on port 3000

### Error: Network timeout
**Cause**: SSE connection might be blocked by proxy/firewall
**Solution**:
- Use direct backend URL for testing
- Configure proxy for SSE (see above)
- Check firewall/antivirus settings

---

## Debugging Checklist

- [ ] Backend running on port 3000
- [ ] Frontend running on port 8080
- [ ] Proxy configured (if using relative URLs)
- [ ] User logged in (has session cookie)
- [ ] Request includes `credentials: 'include'`
- [ ] Request body has valid JSON
- [ ] `query` field is not empty
- [ ] Check server logs for errors

---

## Server Logs to Check

After making a request, check your server logs for:

```
[AI Routes] Error setting up stream: <error details>
[AI Routes] Error details: { message: '...', stack: '...' }
```

This will show you the **exact** error that's happening.

---

## Production Deployment

### Backend URL
In production, update your frontend to use the production backend URL:

```javascript
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://cm3.mojserver.fun';

fetch(`${BACKEND_URL}/api/ai-integration/chat-stream`, ...)
```

### Environment Variables
```bash
# Frontend .env
NEXT_PUBLIC_BACKEND_URL=https://cm3.mojserver.fun

# Backend .env
FRONTEND_URL=https://your-frontend-domain.com
BASE_URL=https://cm3.mojserver.fun
```

---

## Still Not Working?

1. **Check server logs** - Look for the detailed error message
2. **Test regular endpoint first** - Try `/api/ai-integration/chat` (non-streaming)
3. **Verify auth works** - Try `/api/ai-integration/history`
4. **Share the error** - Copy the full error from server logs

---

## Quick Reference

### Correct Request Format
```javascript
fetch('/api/ai-integration/chat-stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  },
  credentials: 'include',
  body: JSON.stringify({
    query: 'Your question',
    includeHistory: true,
    format: 'text',
  }),
});
```

### Event Types You'll Receive
- `status` - Processing status
- `tool` - Tool being accessed
- `thinking` - AI processing
- `chunk` - Response text
- `complete` - Finished
- `error` - Error occurred

---

**Most common fix**: Add proxy configuration to your frontend! 🎯

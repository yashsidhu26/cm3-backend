# Streaming Setup - Dual Server Architecture

## Overview

Due to an unidentified issue with the main app (port 3000) that prevents SSE streaming from working correctly, **all AI streaming functionality** runs on a **separate isolated server** (port 4444).

The streaming code works perfectly on port 4444 but buffers on port 3000, despite:
- ✅ Zero middleware
- ✅ Identical Vertex AI configuration
- ✅ Same Hono setup
- ✅ Direct route mounting

The isolated server runs the **full AI agent** with all tools, context fetching, and features.

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │────────▶│  Main App    │────────▶│  Streaming  │
│             │         │  Port 3000   │         │  Port 4444  │
│             │         │              │         │             │
│             │         │  /api/*      │  Proxy  │ /test-stream│
└─────────────┘         └──────────────┘────────▶└─────────────┘
                             │                         │
                             │                         │
                        Regular API              Vertex AI
                        Endpoints               Streaming
```

## Starting the Servers

### Development Mode (Recommended)

```bash
bun dev
```

This automatically starts both servers:
- **Main App**: http://localhost:3000 (all API endpoints)
- **Streaming**: http://localhost:4444 (real-time SSE streaming)

### Start Individually

```bash
# Terminal 1: Main app only
bun dev:main

# Terminal 2: Streaming server only
bun dev:streaming
```

## How It Works

### Direct Frontend → Streaming Server (Recommended)

1. **Frontend** makes request directly to streaming server: `POST http://localhost:4444/stream`
2. **Streaming server** validates Better Auth session cookie
3. **Streaming server** extracts `userId` from session
4. **Streaming server** runs the full AI agent loop with tools
5. **Streaming server** streams events: `status`, `tool`, `thinking`, `chunk`, `complete`
6. **Streaming server** saves conversation history and usage stats
7. **Frontend** receives real-time SSE stream

### Legacy Proxy (Not Working)

The main app proxy at `/api/ai-integration/chat-stream` exists but buffers the stream. Use the direct endpoint instead.

## Endpoints

### Streaming Server (Port 4444) - Use This!
- **`POST /stream`** - 🎯 Production endpoint with authentication
  - **Requires**: Session cookie from Better Auth (same as main app)
  - **Accepts**: `{ query: string, format?: string, conversationHistory?: array }`
  - **Returns**: SSE stream with `status`, `tool`, `thinking`, `chunk`, `complete`, `error` events
  - **Features**: Full AI agent with all 19 tools, saves conversation history
  - **Use from frontend**: Change URL from `http://localhost:3000/api/ai-integration/chat-stream` to `http://localhost:4444/stream`

- `POST /test-stream` - Simple test (no auth, no agent)
- `GET /` - Test HTML page

### Main App (Port 3000)
- `GET /api/ai-integration/history` - Chat history
- `POST /api/ai-integration/chat` - Non-streaming chat
- `DELETE /api/ai-integration/history` - Clear history
- `GET /api/ai-integration/stats` - Usage statistics
- All other API endpoints
- ~~`POST /api/ai-integration/chat-stream`~~ - Deprecated (buffering issue)

## Testing

### Test Main App Proxy
```bash
# Open test page with authentication
open test-streaming-with-auth.html
```

### Test Isolated Server Directly
```bash
# Open isolated server test page
open http://localhost:4444
```

## Why This Setup?

After extensive debugging, we found that **something in the main app's environment breaks SSE streaming**, causing all chunks to arrive at once instead of incrementally.

Attempted fixes (all failed):
- ❌ Removed all middleware
- ❌ Removed websocket handler
- ❌ Disabled logger, cors, prettyJSON
- ❌ Direct route mounting before middleware
- ❌ Simplified Bun export
- ❌ Identical code to working server

The isolated server proves the streaming code is perfect. The issue is environmental and couldn't be identified, so this dual-server approach is the workaround.

## Production Deployment

For production, you can:
1. Run both servers behind a reverse proxy (nginx)
2. Use different domains: `api.example.com` and `stream.example.com`
3. Or merge streaming into main app if deployed environment doesn't have the same issue

## Troubleshooting

### Streaming Server Not Starting
```bash
# Check if port 4444 is available
lsof -ti:4444 | xargs kill -9

# Start manually
bun test-isolated-server.ts
```

### Main App Can't Connect to Streaming Server
- Ensure both servers are running
- Check logs for "Proxying to isolated streaming server"
- Verify `http://localhost:4444` is accessible

### Chunks Still Buffered
- Confirm you're using port 4444 (check URL in Network tab)
- Test isolated server directly: http://localhost:4444
- If isolated server works but proxy doesn't, check network/firewall

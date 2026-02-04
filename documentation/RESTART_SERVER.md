# 🔴 IMPORTANT: Server Restart Required!

## The server must be restarted for changes to take effect!

### How to Restart:

#### Option 1: In the terminal running the server

1. **Press `Ctrl+C`** to stop the server
2. **Run** `bun run dev` to start it again

#### Option 2: Kill and restart

```bash
# Kill any process on port 3000
lsof -ti:3000 | xargs kill -9

# Start the server
bun run dev
```

---

## ✅ Verify Server Restarted Successfully

After restarting, you should see:

```
╔══════════════════════════════════════════╗
║     Super App API - BHD Stack           ║
║     Bun + Hono + Drizzle                ║
╚══════════════════════════════════════════╝

✓ Loaded module: academics -> /api/academics
✓ Loaded module: auth -> /api/auth
✓ Loaded module: social -> /api/social

🚀 Loaded 3 module(s): academics, auth, social

🔥 Server running on http://localhost:3000
📚 API Docs: http://localhost:3000/api
```

---

## 🧪 Test After Restart

```bash
# Test health endpoint
curl http://localhost:3000/health

# Should return:
# {"status":"ok","uptime":...}
```

---

## ⚠️ Common Restart Issues

### Server won't stop (Ctrl+C doesn't work)

```bash
# Force kill
lsof -ti:3000 | xargs kill -9
```

### Port still in use after killing

```bash
# Wait 2 seconds and try again
sleep 2
bun run dev
```

### Changes not reflecting

```bash
# Clear Bun cache and restart
rm -rf node_modules/.cache
bun run dev
```

---

## 🔍 Debugging: Check if server is actually running

```bash
# Check what's running on port 3000
lsof -i:3000

# Should show:
# COMMAND   PID  USER
# bun     12345  yash
```

---

**Remember:** The server does NOT automatically restart when you change code (unless you're using `bun --watch` which is in `bun run dev`)!

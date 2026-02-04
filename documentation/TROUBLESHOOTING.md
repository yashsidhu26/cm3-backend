# Troubleshooting Guide

Common issues and their solutions for the Super App API.

## 🔧 Authentication Issues

### Error: `DNSException: getaddrinfo ENOTFOUND`

**Symptom:**
```
ERROR [Better Auth]: DNSException DNSException: getaddrinfo ENOTFOUND
 syscall: "getaddrinfo",
   errno: 4,
    code: "ENOTFOUND"
```

**Cause:**  
Better Auth is missing the `BASE_URL` configuration and trying to resolve an undefined hostname.

**Solution:**

1. **Add `BASE_URL` to your `.env` file:**
```env
BASE_URL=http://localhost:3000
```

2. **Restart the server:**
```bash
# Stop the server (Ctrl+C)
bun run dev
```

**Fixed in:** `src/core/auth/auth.ts` now includes `baseURL: process.env.BASE_URL || 'http://localhost:3000'`

---

### Error: `relation "user" does not exist`

**Symptom:**
```
error: relation "user" does not exist
```

**Cause:**  
Database migrations haven't been run.

**Solution:**
```bash
# Generate migrations
bun run db:generate

# Run migrations
bun run db:migrate
```

---

### Error: Session/Cookie not working

**Symptom:**
- Can log in but session isn't persisted
- Protected routes return 401 even after login

**Cause:**  
CORS or cookie configuration issues.

**Solution:**

1. **Check CORS settings in `app.ts`:**
```typescript
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL || '',
  ].filter(Boolean) as string[],
  credentials: true, // IMPORTANT!
}));
```

2. **Ensure frontend uses credentials:**
```javascript
// In frontend
fetch('http://localhost:3000/api/auth/sign-in/email', {
  credentials: 'include', // IMPORTANT!
  // ... other options
})
```

---

## 🗄️ Database Issues

### Error: `ECONNREFUSED`

**Symptom:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Cause:**  
PostgreSQL is not running.

**Solution:**

**macOS (Homebrew):**
```bash
brew services start postgresql@14
```

**Linux:**
```bash
sudo systemctl start postgresql
```

**Docker:**
```bash
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14
```

---

### Error: `password authentication failed`

**Symptom:**
```
error: password authentication failed for user "postgres"
```

**Cause:**  
Incorrect database credentials in `.env`.

**Solution:**

1. **Check your `.env` file:**
```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/super_app
```

2. **Verify PostgreSQL user password:**
```bash
psql -U postgres -h localhost
# If this works, use the same password in DATABASE_URL
```

3. **Reset PostgreSQL password if needed:**
```bash
# macOS/Linux
sudo -u postgres psql
postgres=# ALTER USER postgres PASSWORD 'new_password';
```

---

### Error: `database "super_app" does not exist`

**Symptom:**
```
error: database "super_app" does not exist
```

**Cause:**  
Database hasn't been created.

**Solution:**
```bash
# Create database
createdb super_app

# Or using psql
psql -U postgres
postgres=# CREATE DATABASE super_app;
```

---

## 🚀 Server Issues

### Error: `EADDRINUSE: address already in use :::3000`

**Symptom:**
```
error: EADDRINUSE: address already in use :::3000
```

**Cause:**  
Another process is using port 3000.

**Solution:**

**Option 1: Kill the process**
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Option 2: Use a different port**
```bash
PORT=3001 bun run dev
```

---

### Error: Server starts but endpoints return 404

**Symptom:**
- `/health` returns 404
- All API endpoints return 404

**Cause:**  
Routes aren't being auto-discovered.

**Solution:**

1. **Check module structure:**
```
src/modules/
  ├── academics/
  │   └── academics.routes.ts  ← Must be named *.routes.ts
  ├── auth/
  │   └── auth.routes.ts
  └── social/
      └── social.routes.ts
```

2. **Verify default export:**
```typescript
// In *.routes.ts
const myModule = new Hono();
// ... routes ...
export default myModule; // MUST be default export
```

3. **Check server logs for module loading:**
```
✓ Loaded module: academics -> /api/academics
✓ Loaded module: auth -> /api/auth
✓ Loaded module: social -> /api/social
```

---

## 📦 Module Issues

### Error: Moodle sync fails

**Symptom:**
```
Error: Moodle authentication failed: Invalid credentials
```

**Cause:**  
Mock Moodle service is being used or invalid credentials.

**Solution:**

The current implementation uses **mock responses** for development.

**For Development:**
- Any credentials will work with mock responses
- Mock returns 3 sample courses

**For Production:**
1. Update `src/modules/academics/moodle.service.ts`
2. Replace mock responses with actual Moodle API calls
3. Configure `MOODLE_BASE_URL` in `.env`
4. Get Moodle web service token

---

### Error: `Cannot find module`

**Symptom:**
```
error: Cannot find module '@/core/auth/middleware'
```

**Cause:**  
TypeScript path alias not configured correctly.

**Solution:**

Check `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Note:** Bun supports `@` imports natively if configured.

---

## 🧪 Testing Issues

### Error: Tests fail with "Server is not running"

**Symptom:**
```
❌ Server is not running! Please start the server first
```

**Cause:**  
Dev server isn't running when tests execute.

**Solution:**

**Always run server first:**
```bash
# Terminal 1
bun run dev

# Terminal 2 (wait for server to start)
bun run test
```

---

### Error: Tests timeout

**Symptom:**
```
Error: Test timeout after 30000ms
```

**Cause:**  
Server is slow to respond or database connection issues.

**Solution:**

1. **Check database connection**
2. **Increase timeout in test script:**
```typescript
// In test-api.ts
private timeout: number = 60000; // 60 seconds
```

3. **Check for hanging database connections:**
```bash
# View active connections
psql -U postgres -c "SELECT * FROM pg_stat_activity;"
```

---

## 🔒 Security Issues

### Error: CORS policy blocks requests

**Symptom:**
```
Access to fetch at 'http://localhost:3000/api/auth/sign-in' from origin 
'http://localhost:5173' has been blocked by CORS policy
```

**Cause:**  
Frontend origin not in trusted origins.

**Solution:**

1. **Update `src/app.ts`:**
```typescript
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173', // Add your frontend URL
    process.env.FRONTEND_URL || '',
  ].filter(Boolean) as string[],
  credentials: true,
}));
```

2. **Update `.env`:**
```env
FRONTEND_URL=http://localhost:5173
```

3. **Restart server**

---

### Error: Validation errors on signup

**Symptom:**
```
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR"
  }
}
```

**Cause:**  
Invalid input data (password too short, invalid email, etc.)

**Solution:**

**Check validation requirements:**
- Email: Must be valid email format
- Password: Minimum 8 characters
- Name: Required, non-empty string

**Example valid signup:**
```json
{
  "email": "student@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

---

## 🐛 General Debugging

### Enable Verbose Logging

**Add to `.env`:**
```env
NODE_ENV=development
LOG_LEVEL=debug
```

**Add console logs:**
```typescript
// In your service
console.log('[DEBUG]', 'Variable value:', value);
```

---

### Check Database State

**View all tables:**
```bash
bun run db:studio
# Opens Drizzle Studio at http://localhost:4983
```

**Or use psql:**
```bash
psql -U postgres -d super_app

# List tables
\dt

# View users
SELECT * FROM "user";

# View sessions
SELECT * FROM session;
```

---

### Reset Database

**WARNING: This deletes all data!**

```bash
# Drop and recreate database
dropdb super_app
createdb super_app

# Run migrations
bun run db:migrate
```

---

## 📊 Performance Issues

### Server is slow

**Check:**
1. Database connection pool size
2. Number of active queries
3. Database indexes

**Solution:**

**Add indexes for common queries:**
```typescript
// In schema files
createIndex('idx_user_email').on(user.email),
createIndex('idx_enrollment_user').on(enrollments.userId),
```

**Monitor queries:**
```typescript
// In drizzle client
import { drizzle } from 'drizzle-orm/postgres-js';
export const db = drizzle(client, { 
  schema,
  logger: true // Enable query logging
});
```

---

## 🆘 Still Having Issues?

### 1. Check Logs
```bash
# Server logs show detailed error information
# Look for stack traces and error codes
```

### 2. Verify Environment
```bash
# Check Node/Bun version
bun --version  # Should be 1.1+

# Check PostgreSQL version
psql --version  # Should be 14+
```

### 3. Clean Restart
```bash
# 1. Stop all servers
# 2. Clear node_modules
rm -rf node_modules

# 3. Reinstall
bun install

# 4. Reset database
dropdb super_app && createdb super_app

# 5. Run migrations
bun run db:migrate

# 6. Start fresh
bun run dev
```

### 4. Check Documentation
- [README.md](README.md) - Main documentation
- [AUTH_GUIDE.md](AUTH_GUIDE.md) - Authentication details
- [ACADEMICS_MODULE.md](ACADEMICS_MODULE.md) - Academics module
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing guide

---

## 📝 Reporting Issues

If you can't resolve an issue:

1. **Gather Information:**
   - Error message (full stack trace)
   - Steps to reproduce
   - Environment (OS, Bun version, PostgreSQL version)
   - Relevant code snippets

2. **Check Existing Issues:**
   - Search documentation
   - Review this troubleshooting guide

3. **Create Detailed Report:**
   ```
   **Error:** [Brief description]
   **Steps to Reproduce:**
   1. Run `bun run dev`
   2. Call `/api/auth/sign-up`
   3. Error occurs
   
   **Expected:** Should create user
   **Actual:** DNS error
   
   **Environment:**
   - OS: macOS 14.2
   - Bun: 1.1.0
   - PostgreSQL: 14.5
   
   **Error Log:**
   [Paste full error]
   ```

---

**Last Updated:** 2026-02-03  
**Status:** ✅ Comprehensive troubleshooting guide

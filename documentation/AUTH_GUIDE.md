# Authentication System - Better Auth Integration

Complete authentication implementation using **Better Auth v2+** with session-based authentication, secure HttpOnly cookies, and role-based access control.

## 📦 Installation

```bash
bun add better-auth
```

## 🏗️ Architecture

### File Structure

```
/src
  /core
    /auth
      auth.ts          # Better Auth server instance
      client.ts        # Better Auth client (for frontend)
      middleware.ts    # Route protection middleware
  /modules
    /auth
      auth.routes.ts   # Authentication endpoints
      auth.schema.ts   # Database tables (user, session, account, verification)
```

## 🗄️ Database Schema

The auth system includes four core tables:

### 1. User Table
```typescript
{
  id: UUID (PK)
  name: string
  email: string (unique)
  emailVerified: boolean
  image: string (optional)
  role: enum('student', 'admin')  // Custom field
  bitsId: string (optional)       // Custom field
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 2. Session Table
```typescript
{
  id: UUID (PK)
  userId: UUID (FK -> user)
  token: string (unique)
  ipAddress: string
  userAgent: string
  expiresAt: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 3. Account Table
```typescript
{
  id: UUID (PK)
  userId: UUID (FK -> user)
  accountId: string
  providerId: string
  accessToken: string (optional)
  refreshToken: string (optional)
  idToken: string (optional)
  expiresAt: timestamp (optional)
  password: string (hashed, for email/password)
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 4. Verification Table
```typescript
{
  id: UUID (PK)
  identifier: string
  value: string (token)
  expiresAt: timestamp
  createdAt: timestamp
  updatedAt: timestamp
}
```

## 🔐 Authentication Features

### Session-Based Authentication
- Secure HttpOnly cookies
- 7-day session expiration
- Automatic session refresh every 24 hours
- Session cookie caching (5 minutes)

### Email/Password Authentication
- Minimum 8 characters password
- Automatic password hashing
- Email verification support (configurable)

### Security Features
- Secure cookies in production
- CORS configuration for trusted origins
- IP address and user agent tracking
- Automatic session cleanup

## 🚀 API Endpoints

All authentication endpoints are auto-mounted at `/api/auth/*`

### Better Auth Standard Endpoints

#### Sign Up
```bash
POST /api/auth/sign-up/email
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

#### Sign In
```bash
POST /api/auth/sign-in/email
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "securepassword123"
}
```

#### Sign Out
```bash
POST /api/auth/sign-out
```

#### Get Session
```bash
GET /api/auth/session
```

### Custom Endpoints

#### Get Profile
```bash
GET /api/auth/profile
Authorization: Required (cookie-based)

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "name": "John Doe",
      "email": "student@example.com",
      "role": "student",
      "bitsId": "2021A7PS0001",
      "emailVerified": false,
      "createdAt": "2026-01-31T..."
    }
  }
}
```

#### Update Profile
```bash
PATCH /api/auth/profile
Authorization: Required
Content-Type: application/json

{
  "name": "John Smith",
  "bitsId": "2021A7PS0001"
}
```

#### List All Users (Admin Only)
```bash
GET /api/auth/users
Authorization: Required (admin role)

Response:
{
  "success": true,
  "data": {
    "users": [...],
    "count": 10
  }
}
```

#### Update User Role (Admin Only)
```bash
PATCH /api/auth/users/:id/role
Authorization: Required (admin role)
Content-Type: application/json

{
  "role": "admin"
}
```

#### Delete User (Admin Only)
```bash
DELETE /api/auth/users/:id
Authorization: Required (admin role)
```

#### Check Auth Status
```bash
GET /api/auth/status

Response:
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": "...",
      "name": "John Doe",
      "email": "student@example.com",
      "role": "student"
    }
  }
}
```

## 🛡️ Middleware Usage

### 1. Protect Middleware
Requires user to be authenticated. Returns 401 if not.

```typescript
import { protect } from '@/core/auth/middleware';

app.get('/protected', protect, (c) => {
  const user = c.get('user');
  return c.json({ message: `Hello ${user.name}` });
});
```

### 2. Authorize Middleware
Checks for specific role(s). Returns 403 if unauthorized.

```typescript
import { authorize } from '@/core/auth/middleware';

// Single role
app.get('/admin/dashboard', protect, authorize('admin'), (c) => {
  return c.json({ message: 'Admin dashboard' });
});

// Multiple roles
app.get('/staff', protect, authorize(['admin', 'faculty']), (c) => {
  return c.json({ message: 'Staff only' });
});
```

### 3. Require Admin Middleware
Convenience middleware combining protect + authorize('admin').

```typescript
import { requireAdmin } from '@/core/auth/middleware';

app.get('/admin/settings', requireAdmin, (c) => {
  return c.json({ message: 'Admin settings' });
});
```

### 4. Optional Auth Middleware
Injects user if authenticated, but doesn't require it.

```typescript
import { optionalAuth } from '@/core/auth/middleware';

app.get('/posts', optionalAuth, (c) => {
  const user = c.get('user');
  
  if (user) {
    // Show personalized content
  } else {
    // Show public content
  }
  
  return c.json({ posts: [] });
});
```

## 💻 Frontend Integration

### Client Setup

```typescript
import { authClient } from '@/core/auth/client';

// Or configure for your frontend
import { createAuthClient } from 'better-auth/client';

const auth = createAuthClient({
  baseURL: 'http://localhost:3000',
  fetchOptions: {
    credentials: 'include', // Important for cookies
  },
});
```

### Sign Up

```typescript
const { data, error } = await authClient.signUp.email({
  email: 'student@example.com',
  password: 'securepassword123',
  name: 'John Doe',
});

if (error) {
  console.error('Sign up failed:', error);
} else {
  console.log('User created:', data);
}
```

### Sign In

```typescript
const { data, error } = await authClient.signIn.email({
  email: 'student@example.com',
  password: 'securepassword123',
});

if (error) {
  console.error('Login failed:', error);
} else {
  console.log('Logged in:', data);
}
```

### Get Session

```typescript
const session = await authClient.getSession();

if (session?.user) {
  console.log('Current user:', session.user);
} else {
  console.log('Not authenticated');
}
```

### Sign Out

```typescript
await authClient.signOut();
console.log('Logged out');
```

## 🔧 Configuration

### Environment Variables

Add to your `.env` file:

```env
# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Database connection (already configured)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app

# Node environment
NODE_ENV=development
```

### Email Verification

To enable email verification:

1. Update `src/core/auth/auth.ts`:
```typescript
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true, // Enable this
  // Add email service configuration
},
```

2. Configure email provider (e.g., Resend, SendGrid)

## 🔄 Database Migration

After setting up auth, generate and run migrations:

```bash
# Generate migration
bun run db:generate

# Apply migration
bun run db:migrate

# Optional: Open Drizzle Studio to view tables
bun run db:studio
```

## 🧪 Testing Authentication

### 1. Create a Test User

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Access Protected Route

```bash
curl http://localhost:3000/api/auth/profile \
  -b cookies.txt
```

### 4. Create Admin User

First, create a regular user, then update their role via database:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'admin@example.com';
```

Or use the admin endpoint (requires existing admin):

```bash
curl -X PATCH http://localhost:3000/api/auth/users/{user-id}/role \
  -H "Content-Type: application/json" \
  -b admin-cookies.txt \
  -d '{"role": "admin"}'
```

## 🎯 Role-Based Access Control (RBAC)

### Available Roles

- **student** (default) - Standard user access
- **admin** - Full administrative access

### Extending Roles

To add more roles (e.g., faculty, moderator):

1. Update the enum in `auth.schema.ts`:
```typescript
export const userRoleEnum = pgEnum('user_role', ['student', 'faculty', 'admin']);
```

2. Regenerate migrations:
```bash
bun run db:generate
bun run db:migrate
```

3. Use the new role in middleware:
```typescript
app.get('/faculty-only', protect, authorize(['admin', 'faculty']), handler);
```

## 🛠️ Troubleshooting

### Cookies Not Working

1. Check CORS configuration includes `credentials: true`
2. Ensure frontend uses `credentials: 'include'` in fetch
3. Verify trusted origins in `auth.ts`

### Session Expired

- Default session: 7 days
- Session auto-refreshes every 24 hours when active
- User must re-login after 7 days of inactivity

### Can't Access Protected Routes

1. Check if user is authenticated: `GET /api/auth/status`
2. Verify cookie is being sent with request
3. Check middleware is applied correctly

## 🔒 Security Best Practices

1. **Use HTTPS in Production**
   - Set `NODE_ENV=production` to enable secure cookies
   - Configure SSL/TLS certificates

2. **Environment Variables**
   - Never commit `.env` file
   - Use secrets management in production

3. **Password Policy**
   - Enforce strong passwords
   - Consider adding password strength requirements

4. **Rate Limiting**
   - Add rate limiting to auth endpoints
   - Prevent brute force attacks

5. **Session Management**
   - Monitor active sessions
   - Implement session revocation
   - Log authentication events

## 📚 Additional Resources

- [Better Auth Documentation](https://better-auth.com)
- [Hono Middleware Guide](https://hono.dev/guides/middleware)
- [Drizzle ORM Relations](https://orm.drizzle.team/docs/rqb)

---

**Authentication System Status:** ✅ Production Ready

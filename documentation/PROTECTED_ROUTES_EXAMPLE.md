# Protected Routes Examples

How to add authentication to your existing modules.

## Example 1: Protect Academics Routes

Update `src/modules/academics/academics.routes.ts`:

```typescript
import { Hono } from 'hono';
import { protect, requireAdmin } from '../../core/auth/middleware';
import { academicsService } from './academics.service';
import { successResponse } from '../../core/utils/response';

const academics = new Hono();

// Public route - anyone can view courses
academics.get('/courses', async (c) => {
  const courses = await academicsService.getAllCourses();
  return successResponse(c, { courses });
});

// Protected route - must be logged in to enroll
academics.post('/enrollments', protect, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  
  // Auto-use authenticated user's ID
  const enrollment = await academicsService.enrollUser(user.id, body.courseId);
  return successResponse(c, { enrollment });
});

// Admin only - create new courses
academics.post('/courses', requireAdmin, async (c) => {
  const body = await c.req.json();
  const course = await academicsService.createCourse(body);
  return successResponse(c, { course });
});

export default academics;
```

## Example 2: Protect Social Routes

Update `src/modules/social/social.routes.ts`:

```typescript
import { Hono } from 'hono';
import { protect, optionalAuth } from '../../core/auth/middleware';
import { socialService } from './social.service';
import { successResponse } from '../../core/utils/response';

const social = new Hono();

// Public route with optional auth - shows personalized feed if logged in
social.get('/posts', optionalAuth, async (c) => {
  const user = c.get('user');
  const posts = await socialService.getAllPosts();
  
  return successResponse(c, { 
    posts,
    personalized: !!user 
  });
});

// Protected route - must be logged in to create posts
social.post('/posts', protect, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  
  // Auto-set userId from authenticated user
  const post = await socialService.createPost({
    ...body,
    userId: user.id,
  });
  
  return successResponse(c, { post });
});

// Protected route - own posts only (or admin)
social.delete('/posts/:id', protect, async (c) => {
  const user = c.get('user');
  const postId = c.req.param('id');
  
  // Get post to check ownership
  const post = await socialService.getPostById(postId);
  
  // Check if user owns the post or is admin
  const userRole = (user as any).role || 'student';
  if (post.userId !== user.id && userRole !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  
  await socialService.deletePost(postId);
  return successResponse(c, { message: 'Post deleted' });
});

export default social;
```

## Example 3: Create Admin Module

Create `src/modules/admin/admin.routes.ts`:

```typescript
import { Hono } from 'hono';
import { requireAdmin } from '../../core/auth/middleware';
import { db } from '../../core/database/client';
import { user } from '../auth/auth.schema';
import { courses } from '../academics/academics.schema';
import { posts } from '../social/social.schema';
import { successResponse } from '../../core/utils/response';
import { count } from 'drizzle-orm';

const admin = new Hono();

// All routes in this module require admin
admin.use('*', requireAdmin);

// Dashboard stats
admin.get('/dashboard', async (c) => {
  const [userCount] = await db.select({ count: count() }).from(user);
  const [courseCount] = await db.select({ count: count() }).from(courses);
  const [postCount] = await db.select({ count: count() }).from(posts);
  
  return successResponse(c, {
    stats: {
      users: userCount.count,
      courses: courseCount.count,
      posts: postCount.count,
    },
  });
});

// System info
admin.get('/system', async (c) => {
  return successResponse(c, {
    system: {
      runtime: 'Bun',
      version: Bun.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

export default admin;
```

Create the schema file too:
```bash
touch src/modules/admin/admin.schema.ts
```

```typescript
// admin.schema.ts can be empty if no tables needed
export {};
```

## Example 4: Mixed Protection Levels

Create `src/modules/profile/profile.routes.ts`:

```typescript
import { Hono } from 'hono';
import { protect, optionalAuth } from '../../core/auth/middleware';
import { db } from '../../core/database/client';
import { user } from '../auth/auth.schema';
import { eq } from 'drizzle-orm';
import { successResponse, errorResponse } from '../../core/utils/response';

const profile = new Hono();

// Public - view any user's profile
profile.get('/:id', optionalAuth, async (c) => {
  const userId = c.req.param('id');
  const currentUser = c.get('user');
  
  const userData = await db
    .select({
      id: user.id,
      name: user.name,
      bitsId: user.bitsId,
      // Only show email if viewing own profile
      email: currentUser?.id === userId ? user.email : null,
    })
    .from(user)
    .where(eq(user.id, userId));
  
  if (!userData[0]) {
    return errorResponse(c, 'User not found', 404);
  }
  
  return successResponse(c, { user: userData[0] });
});

// Protected - update own profile
profile.patch('/me', protect, async (c) => {
  const currentUser = c.get('user');
  const body = await c.req.json();
  
  const updated = await db
    .update(user)
    .set({
      name: body.name,
      bitsId: body.bitsId,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning();
  
  return successResponse(c, { user: updated[0] });
});

export default profile;
```

## Quick Reference

### Middleware Options

```typescript
import { 
  protect,        // Require authentication
  requireAdmin,   // Require admin role
  authorize,      // Require specific role(s)
  optionalAuth,   // Optional authentication
} from '../../core/auth/middleware';

// Single route protection
app.get('/route', protect, handler);

// Multiple middleware
app.post('/admin', protect, requireAdmin, handler);

// Custom role check
app.get('/staff', protect, authorize(['admin', 'faculty']), handler);

// Optional auth
app.get('/feed', optionalAuth, handler);
```

### Access User in Routes

```typescript
import { Context } from 'hono';

async function handler(c: Context) {
  const user = c.get('user'); // Will be null if not authenticated
  
  if (user) {
    console.log('User ID:', user.id);
    console.log('User Email:', user.email);
    console.log('User Role:', (user as any).role);
  }
}
```

### Testing Protected Routes

```bash
# 1. Login first
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"password123"}'

# 2. Use cookie for protected routes
curl http://localhost:3000/api/academics/enrollments \
  -b cookies.txt \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"courseId":"..."}'
```

---

These examples show how to seamlessly integrate authentication into your modular monolith architecture!

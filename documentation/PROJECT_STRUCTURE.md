# Super App - Complete Project Structure

## 📁 Directory Layout

```
/Users/yash/Documents/Startup/
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TypeScript configuration
├── drizzle.config.ts              # Drizzle ORM config
├── .env.example                    # Environment variables template
├── .gitignore
│
├── README.md                       # Main project documentation
├── AUTH_GUIDE.md                  # Authentication guide
├── ACADEMICS_MODULE.md            # Academics module docs
├── PROTECTED_ROUTES_EXAMPLE.md    # Route protection examples
├── PROJECT_STRUCTURE.md           # This file
│
├── drizzle/                       # Generated migrations (after db:generate)
│
└── src/
    ├── app.ts                     # Main entry point with auto-discovery
    │
    ├── core/                      # Core infrastructure
    │   ├── auth/
    │   │   ├── auth.ts           # Better Auth server instance
    │   │   ├── client.ts         # Better Auth client (frontend)
    │   │   └── middleware.ts     # Auth middleware (protect, authorize, etc.)
    │   │
    │   ├── database/
    │   │   ├── client.ts         # Drizzle database connection
    │   │   └── schema.ts         # Central schema exports
    │   │
    │   └── utils/
    │       └── response.ts       # Standard API response wrappers
    │
    └── modules/                   # Feature modules
        ├── auth/                  # Authentication module
        │   ├── auth.schema.ts    # User, session, account, verification tables
        │   └── auth.routes.ts    # Auth endpoints (auto-mounted at /api/auth)
        │
        ├── academics/             # Academics module
        │   ├── academics.schema.ts    # Courses, enrollments, resources tables
        │   ├── moodle.service.ts      # Moodle LMS integration
        │   ├── academics.service.ts   # Business logic & sync orchestration
        │   └── academics.routes.ts    # Academic endpoints (auto-mounted at /api/academics)
        │
        └── social/                # Social module
            ├── social.schema.ts   # Posts, comments tables
            ├── social.service.ts  # Social features logic
            └── social.routes.ts   # Social endpoints (auto-mounted at /api/social)
```

## 🎯 Module Breakdown

### Core Infrastructure (`/src/core`)

**Purpose:** Shared utilities and services used across all modules

#### Authentication (`/core/auth`)
- `auth.ts` - Better Auth configuration and server instance
- `client.ts` - Client SDK for frontend integration
- `middleware.ts` - Route protection (protect, authorize, requireAdmin)

#### Database (`/core/database`)
- `client.ts` - Drizzle ORM connection with type inference
- `schema.ts` - Aggregates all table schemas for migrations

#### Utils (`/core/utils`)
- `response.ts` - Standardized API response helpers

### Feature Modules (`/src/modules`)

**Purpose:** Self-contained feature domains with auto-discovery

#### Auth Module (`/modules/auth`)
**Auto-mounted at:** `/api/auth`

**Tables:**
- `user` - User accounts with roles (student, admin)
- `session` - Active sessions
- `account` - Auth providers & credentials
- `verification` - Email verification tokens

**Key Features:**
- Email/password authentication
- Session management
- Role-based access control
- User profile management
- Admin user management

#### Academics Module (`/modules/academics`)
**Auto-mounted at:** `/api/academics`

**Tables:**
- `courses` - Course information from Moodle
- `enrollments` - User-course relationships
- `resources` - Course materials (PDFs, slides, videos)

**Key Features:**
- Moodle synchronization
- Course management
- Resource tracking
- Enrollment management

**Services:**
- `MoodleClient` - Handles Moodle API communication
- `AcademicsService` - Business logic and sync orchestration

#### Social Module (`/modules/social`)
**Auto-mounted at:** `/api/social`

**Tables:**
- `posts` - User posts
- `comments` - Post comments

**Key Features:**
- Create/read/delete posts
- Comment on posts
- User feeds

## 🔄 Auto-Discovery System

### How It Works

The `app.ts` scans `src/modules/` directory:

```typescript
// src/app.ts
async function loadModules() {
  // Scans src/modules directory
  // Finds all *.routes.ts files
  // Dynamically imports and mounts them
  
  // Example: src/modules/academics/academics.routes.ts
  // → Mounted at /api/academics
}
```

### Adding a New Module

1. **Create module directory:**
```bash
mkdir -p src/modules/my-module
```

2. **Create required files:**
```bash
touch src/modules/my-module/my-module.schema.ts
touch src/modules/my-module/my-module.service.ts
touch src/modules/my-module/my-module.routes.ts
```

3. **Implement schema:**
```typescript
// my-module.schema.ts
export const myTable = pgTable('my_table', { ... });
```

4. **Export schema in central file:**
```typescript
// src/core/database/schema.ts
export * from '../../modules/my-module/my-module.schema';
```

5. **Create routes:**
```typescript
// my-module.routes.ts
import { Hono } from 'hono';
const myModule = new Hono();

myModule.get('/', (c) => c.json({ message: 'Hello' }));

export default myModule; // MUST be default export
```

6. **Restart server:**
```bash
bun run dev
# Module auto-discovered and mounted at /api/my-module
```

## 📊 Database Architecture

### Schema Organization

```
Better Auth Tables:
├── user                 (from auth.schema.ts)
├── session
├── account
└── verification

Academics Tables:
├── courses             (from academics.schema.ts)
├── enrollments
└── resources

Social Tables:
├── posts              (from social.schema.ts)
└── comments
```

### Relationships

```
user ────┬─── enrollments ─── courses ─── resources
         │
         └─── posts ─── comments
```

### Migration Workflow

```bash
# 1. Define/update schemas
# Edit *.schema.ts files

# 2. Generate migrations
bun run db:generate

# 3. Review generated SQL in drizzle/ folder

# 4. Apply migrations
bun run db:migrate

# 5. View database
bun run db:studio
```

## 🔐 Security Layers

### Layer 1: Global Middleware (app.ts)
```typescript
app.use('*', logger());        // Request logging
app.use('*', cors());          // CORS with credentials
app.use('*', injectUser);      // Auto-inject authenticated user
```

### Layer 2: Route-Level Middleware
```typescript
// Public routes
academics.get('/courses', handler);

// Protected routes (authentication required)
academics.get('/my-courses', protect, handler);

// Admin routes (admin role required)
academics.post('/courses', requireAdmin, handler);

// Custom role check
academics.get('/staff', protect, authorize(['admin', 'faculty']), handler);
```

### Layer 3: Business Logic Validation
```typescript
// Check resource access
const userCourses = await getUserCourses(userId);
const isEnrolled = userCourses.some(c => c.id === courseId);
if (!isEnrolled) throw new Error('Not enrolled');
```

## 🌐 API Endpoints Map

### Authentication (`/api/auth`)
```
POST   /sign-up/email           Register user
POST   /sign-in/email           Login
POST   /sign-out                Logout
GET    /session                 Get session
GET    /profile                 Get user profile (protected)
PATCH  /profile                 Update profile (protected)
GET    /users                   List users (admin)
PATCH  /users/:id/role          Update role (admin)
DELETE /users/:id               Delete user (admin)
GET    /status                  Check auth status (public)
```

### Academics (`/api/academics`)
```
POST   /sync                    Sync Moodle data (protected)
GET    /my-courses              Get my courses (protected)
GET    /courses/:id/resources   Get course resources (protected, enrolled)
GET    /courses                 List all courses (public)
GET    /courses/:id             Get course details (public)
POST   /courses                 Create course (admin)
POST   /resources               Create resource (admin)
PATCH  /resources/:id/downloaded Mark downloaded (protected)
GET    /courses/:id/enrollments Get enrollments (admin)
POST   /enrollments             Create enrollment (admin)
DELETE /enrollments             Delete enrollment (admin)
```

### Social (`/api/social`)
```
GET    /posts                   List posts (public)
GET    /posts/:id               Get post (public)
POST   /posts                   Create post (protected)
DELETE /posts/:id               Delete post (protected, owner/admin)
GET    /posts/:id/comments      Get comments (public)
POST   /comments                Create comment (protected)
GET    /users/:id/posts         Get user posts (public)
```

## 🧪 Testing Workflow

### 1. Setup
```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env

# Run migrations
bun run db:generate
bun run db:migrate

# Start server
bun run dev
```

### 2. Create Test User
```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

### 3. Login
```bash
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 4. Test Protected Routes
```bash
# Sync Moodle data
curl -X POST http://localhost:3000/api/academics/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"moodleUsername":"2021A7PS0001","moodlePassword":"moodle_pass"}'

# Get my courses
curl http://localhost:3000/api/academics/my-courses -b cookies.txt

# Create post
curl -X POST http://localhost:3000/api/social/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Hello","content":"My first post","userId":"user-id"}'
```

## 📦 Dependencies

### Runtime Dependencies
```json
{
  "hono": "^4.0.0",              // Web framework
  "drizzle-orm": "^0.30.0",      // TypeScript ORM
  "postgres": "^3.4.0",          // PostgreSQL client
  "zod": "^3.22.0",              // Schema validation
  "@hono/zod-validator": "^0.2.0", // Hono Zod integration
  "better-auth": "^1.0.0"        // Authentication
}
```

### Dev Dependencies
```json
{
  "@types/bun": "latest",
  "drizzle-kit": "^0.20.0"       // Migration toolkit
}
```

## 🚀 Scripts

```bash
bun run dev          # Start dev server with hot reload
bun run start        # Start production server
bun run db:generate  # Generate migration files
bun run db:migrate   # Run migrations
bun run db:studio    # Open Drizzle Studio GUI
```

## 🔧 Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app

# Frontend
FRONTEND_URL=http://localhost:5173

# Moodle
MOODLE_BASE_URL=https://cms.bits-pilani.ac.in
```

## 🎯 Architecture Principles

### 1. Modular Monolith
- Features isolated in modules
- Modules auto-discovered and mounted
- No manual registration needed

### 2. Type Safety
- End-to-end TypeScript
- Drizzle ORM type inference
- Zod runtime validation

### 3. Convention over Configuration
- Standard file naming (`*.routes.ts`)
- Auto-mounting based on directory structure
- Minimal boilerplate

### 4. Security First
- Authentication middleware on all routes
- Role-based access control
- Input validation with Zod

### 5. Developer Experience
- Hot reload with Bun
- Type-safe queries
- Clear error messages
- Comprehensive documentation

---

**Tech Stack:** Bun + Hono + Drizzle + PostgreSQL + Better Auth  
**Architecture:** Feature-Based Modular Monolith  
**Status:** ✅ Production Ready

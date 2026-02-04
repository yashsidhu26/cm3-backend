# Super App API - BHD Stack

A high-performance, type-safe API built with the **BHD Stack** (Bun, Hono, Drizzle) using a **Feature-Based Modular Monolith** architecture.

## 🚀 Tech Stack

- **Runtime:** [Bun](https://bun.sh) v1.1+ - Ultra-fast JavaScript runtime
- **Framework:** [Hono](https://hono.dev) - Lightweight, fast web framework
- **Database:** PostgreSQL - Robust relational database
- **ORM:** [Drizzle ORM](https://orm.drizzle.team) - TypeScript-first ORM
- **Language:** TypeScript - Type-safe development

## 📁 Project Structure

```
/src
  /core
    /database
      client.ts           # Drizzle connection
      schema.ts           # Central schema exports
      /tables
        users.ts          # Core users table
    /utils
      response.ts         # API response wrappers
  /modules
    /academics            # Academic features module
      academics.routes.ts
      academics.service.ts
      academics.schema.ts
    /social               # Social features module
      social.routes.ts
      social.service.ts
      social.schema.ts
  app.ts                  # Main entry point
```

## 🏗️ Architecture Principles

### 1. Feature-Based Modules
Each feature is self-contained in its own module with:
- **Routes** (`*.routes.ts`) - HTTP endpoints
- **Services** (`*.service.ts`) - Business logic
- **Schemas** (`*.schema.ts`) - Database tables

### 2. Auto-Discovery
New modules are automatically mounted when they contain a `*.routes.ts` file. No manual registration needed!

### 3. Type Safety
- Full TypeScript type inference from database to API
- Drizzle ORM provides compile-time SQL type checking
- Zod validation for request payloads

### 4. Consistent API Responses
All responses follow a standard format:
```typescript
{
  success: boolean,
  data?: any,
  error?: { message, code, details },
  meta: { timestamp, path }
}
```

## 🔧 Setup

### Prerequisites
- [Bun](https://bun.sh) v1.1+
- PostgreSQL 14+

### Installation

1. **Install dependencies:**
```bash
bun install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Generate database migrations:**
```bash
bun run db:generate
```

4. **Run migrations:**
```bash
bun run db:migrate
```

5. **Start development server:**
```bash
bun run dev
```

The API will be available at `http://localhost:3000`

## 🧪 Testing

### Run All Tests

```bash
# Terminal 1: Start the server
bun run dev

# Terminal 2: Run tests
bun run test
```

The test suite includes:
- ✅ 25 comprehensive tests
- ✅ Authentication & authorization
- ✅ Academics module (Moodle sync)
- ✅ Social module (posts, comments)
- ✅ Error handling & validation
- ✅ ~2 second runtime

**Quick Start:** See [TEST_QUICK_START.md](TEST_QUICK_START.md)  
**Full Guide:** See [TESTING_GUIDE.md](TESTING_GUIDE.md)

## 📦 Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run start` - Start production server
- `bun run test` - Run comprehensive API tests
- `bun run test:watch` - Run tests in watch mode
- `bun run db:generate` - Generate migrations from schema
- `bun run db:migrate` - Run pending migrations
- `bun run db:studio` - Open Drizzle Studio (database GUI)

## 🗄️ Database Schema

### Core Tables

#### Users
```typescript
{
  id: UUID (PK)
  name: string
  bits_id: string (unique)
  email: string (unique)
  role: enum('student', 'faculty', 'admin')
  created_at: timestamp
  updated_at: timestamp
}
```

### Academics Module

#### Courses
```typescript
{
  id: UUID (PK)
  name: string
  code: string (unique)
  moodle_id: string (optional)
  created_at: timestamp
  updated_at: timestamp
}
```

#### Enrollments (Many-to-Many)
```typescript
{
  user_id: UUID (FK -> users)
  course_id: UUID (FK -> courses)
  enrolled_at: timestamp
  PK: (user_id, course_id)
}
```

### Social Module

#### Posts
```typescript
{
  id: UUID (PK)
  user_id: UUID (FK -> users)
  title: string
  content: text
  likes_count: integer
  comments_count: integer
  created_at: timestamp
  updated_at: timestamp
}
```

#### Comments
```typescript
{
  id: UUID (PK)
  post_id: UUID (FK -> posts)
  user_id: UUID (FK -> users)
  content: text
  created_at: timestamp
  updated_at: timestamp
}
```

## 🛣️ API Endpoints

### Academics Module (`/api/academics`)

- `GET /courses` - List all courses
- `GET /courses/:id` - Get course by ID
- `POST /courses` - Create new course
- `GET /courses/:id/enrollments` - Get course enrollments
- `POST /enrollments` - Enroll user in course
- `DELETE /enrollments` - Unenroll user from course
- `GET /users/:id/courses` - Get user's courses

### Social Module (`/api/social`)

- `GET /posts` - List all posts
- `GET /posts/:id` - Get post by ID
- `POST /posts` - Create new post
- `DELETE /posts/:id` - Delete post
- `GET /posts/:id/comments` - Get post comments
- `POST /comments` - Create comment
- `GET /users/:id/posts` - Get user's posts

## 🧩 Adding New Modules

1. Create new directory in `src/modules/`:
```bash
mkdir -p src/modules/my-module
```

2. Create required files:
```typescript
// my-module.schema.ts - Define tables
// my-module.service.ts - Business logic
// my-module.routes.ts - HTTP endpoints (must export default Hono instance)
```

3. Export schemas in `src/core/database/schema.ts`:
```typescript
export * from '../../modules/my-module/my-module.schema';
```

4. Restart server - module is auto-mounted! 🎉

## 🔒 Environment Variables

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=super_app
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app
```

## 🎯 Best Practices

1. **Keep modules independent** - Avoid cross-module dependencies
2. **Use services for business logic** - Keep routes thin
3. **Validate all inputs** - Use Zod schemas
4. **Type everything** - Leverage TypeScript and Drizzle types
5. **Use transactions** - For multi-step database operations
6. **Handle errors gracefully** - Use standard error responses

## 📚 Documentation

- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev)
- [Drizzle ORM Documentation](https://orm.drizzle.team)

## 🤝 Team Guidelines

- Follow the established module structure
- Write descriptive commit messages
- Keep services focused and testable
- Document complex business logic
- Use meaningful variable names

## 📈 Performance Tips

- Use Drizzle's prepared statements for repeated queries
- Index foreign keys and frequently queried columns
- Use database relations for efficient joins
- Batch operations when possible
- Monitor query performance with Drizzle Studio

---

Built with ❤️ using the BHD Stack

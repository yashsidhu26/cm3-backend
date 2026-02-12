# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun dev` — Start dev server with watch mode
- `bun start` — Production start
- `bun run build` — Build to dist/app.js
- `bun test` — Run test suite (test-api.ts)
- `bun run test:watch` — Tests in watch mode
- `bun run test:gmail-auth` — Gmail auth module tests
- `bun run db:generate` — Generate Drizzle migrations
- `bun run db:migrate` — Run migrations
- `bun run db:push` — Push schema directly to DB
- `bun run db:studio` — Open Drizzle Studio web UI

## Architecture

**Stack**: Bun runtime, Hono framework, Drizzle ORM, PostgreSQL, Better Auth (session-based with HttpOnly cookies).

**Feature-based modular monolith** with automatic module discovery. `src/app.ts` scans `src/modules/` and mounts each module's default export at `/api/[module-name]` (exception: `gmail-auth` mounts at `/auth`).

### Module structure

Each module in `src/modules/` follows this pattern:
- `[name].routes.ts` — Hono route definitions (required, must export default Hono app)
- `[name].service.ts` — Business logic with direct Drizzle DB access
- `[name].schema.ts` — Drizzle table definitions and Zod validation schemas

### Auth middleware chain

`injectUser` (global) → `protect` (requires auth, 401) → `authorize('role')` (RBAC, 403)

- User: `c.get('user')` / Session: `c.get('session')` in route handlers
- `requireAdmin` — convenience for admin-only routes
- `optionalAuth` — injects user if present, doesn't require it

### Response helpers

All endpoints use standardized `ApiResponse` via helpers in `src/core/utils/`: `successResponse()`, `errorResponse()`, `createdResponse()`, `noContentResponse()`.

### Validation

Zod schemas with `@hono/zod-validator`: `zValidator('json', schema)` as route middleware.

### Database

Drizzle ORM with PostgreSQL. Each module defines its own tables; all are re-exported from `src/core/database/schema.ts` for migration generation. Relations use Drizzle `relations()` for type-safe joins.

## Key env vars

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BASE_URL`, `FRONTEND_URL`, `MOODLE_BASE_URL`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI (optional)`, `ENCRYPTION_KEY` (min 32 chars).

**AI Integration**: `GROQ_API_KEY`, `GCP_PROJECT_ID`, `GCP_LOCATION` (uses Google Cloud Vertex AI with $300 free credits, requires `gcloud auth application-default login` or service account key).

## Conventions

- Module directories: kebab-case (`student-profile`, `gmail-auth`)
- Files: kebab-case with type suffix (`moodle.service.ts`)
- Do NOT create `.md` files unless explicitly requested (per project rules)

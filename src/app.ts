import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { ZodError } from 'zod';
import { errorResponse } from './core/utils/response';
import { injectUser } from './core/auth/middleware';
import { initializeDebugLogger } from './core/utils/debug-logger';

// Import all module routes statically
import academicsRoutes from './modules/academics/academics.routes';
import sectionsRoutes from './modules/academics/sections.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import authRoutes from './modules/auth/auth.routes';
import aiIntegrationRoutes from './modules/ai-integration/ai-integration.routes';
import socialRoutes from './modules/social/social.routes';
import gmailAuthRoutes from './modules/gmail-auth/gmail-auth.routes';
import studentProfileRoutes from './modules/student-profile/student-profile.routes';
import skillsInterestsRoutes from './modules/skills-interests/skills-interests.routes';

// Initialize debug logger before anything else
initializeDebugLogger();

/**
 * Super App API - Main Entry Point
 * BHD Stack (Bun + Hono + Drizzle)
 * 
 * Architecture: Feature-Based Modular Monolith
 * - Auto-discovers and mounts route modules from /modules directory
 * - Enforces type safety with TypeScript and Drizzle ORM
 * - Global error handling for consistent API responses
 */

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.FRONTEND_URL || '',
  ].filter(Boolean) as string[],
  credentials: true,
}));
app.use('*', prettyJSON());

// Authentication middleware - injects user into context if authenticated
app.use('*', injectUser);

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    message: 'Super App API - BHD Stack',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Mount all modules statically
 * Using static imports for reliability and better tree-shaking
 */
const modules = [
  { name: 'academics', path: '/api/academics', routes: academicsRoutes },
  { name: 'sections', path: '/api/sections', routes: sectionsRoutes },
  { name: 'payments', path: '/api/payments', routes: paymentsRoutes },
  { name: 'auth', path: '/api/auth', routes: authRoutes },
  { name: 'ai-integration', path: '/api/ai-integration', routes: aiIntegrationRoutes },
  { name: 'social', path: '/api/social', routes: socialRoutes },
  { name: 'gmail-auth', path: '/auth', routes: gmailAuthRoutes },
  { name: 'student-profile', path: '/api/student-profile', routes: studentProfileRoutes },
  { name: 'skills-interests', path: '/api/skills-interests', routes: skillsInterestsRoutes },
];

console.log('\n🔄 Mounting modules...\n');

for (const module of modules) {
  app.route(module.path, module.routes);
  console.log(`✓ ${module.name} -> ${module.path}`);
}

console.log(`\n🚀 Loaded ${modules.length} module(s)\n`);


/**
 * Global Error Handler
 * Catches all errors and formats them consistently
 */
app.onError((err, c) => {
  console.error('Global error handler:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return errorResponse(
      c,
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      err.errors
    );
  }

  // Handle database errors
  if (err.message?.includes('database') || err.message?.includes('query')) {
    return errorResponse(
      c,
      'Database operation failed',
      500,
      'DATABASE_ERROR'
    );
  }

  // Generic error response
  return errorResponse(
    c,
    err.message || 'Internal server error',
    500,
    'INTERNAL_ERROR'
  );
});

/**
 * 404 Handler - Must be registered after all routes
 */
app.notFound((c) => {
  return errorResponse(c, 'Route not found', 404, 'NOT_FOUND');
});

/**
 * Start the server
 */
const PORT = Number(process.env.PORT) || 3000;

console.log(`
╔══════════════════════════════════════════╗
║     Super App API - BHD Stack           ║
║     Bun + Hono + Drizzle                ║
╚══════════════════════════════════════════╝
`);

import { websocket } from './core/utils/websocket';

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};

console.log(`🔥 Server running on http://localhost:${PORT}`);
console.log(`📚 API Docs: http://localhost:${PORT}/api`);

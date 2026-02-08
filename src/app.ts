import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { ZodError } from 'zod';
import { errorResponse } from './core/utils/response';
import { injectUser } from './core/auth/middleware';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

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
 * Dynamic Module Loading
 * Scans src/modules directory and auto-mounts any *.routes.ts files
 * This eliminates manual registration of new modules
 */
async function loadModules() {
  // Use cwd so bundled app (e.g. dist/app.js) still finds src/modules
  const modulesPath = join(process.cwd(), 'src', 'modules');
  const modules: string[] = [];

  try {
    const modulesDirs = readdirSync(modulesPath);

    for (const dir of modulesDirs) {
      const modulePath = join(modulesPath, dir);
      const stat = statSync(modulePath);

      if (stat.isDirectory()) {
        // Look for *.routes.ts file in the module directory
        const files = readdirSync(modulePath);
        const routeFile = files.find((f) => f.endsWith('.routes.ts'));

        if (routeFile) {
          const routePath = resolve(modulePath, routeFile);

          try {
            // Dynamic import of the route module (absolute path for bundle compatibility)
            const module = await import(routePath);
            const routeHandler = module.default;

            if (routeHandler) {
              // Mount the module with /api/[module-name] prefix (gmail-auth mounts at /auth)
              const mountPath = dir === 'gmail-auth' ? '/auth' : `/api/${dir}`;
              app.route(mountPath, routeHandler);
              modules.push(dir);
              console.log(`✓ Loaded module: ${dir} -> ${mountPath}`);
            }
          } catch (error) {
            console.error(`✗ Failed to load module ${dir}:`, error);
          }
        }
      }
    }

    console.log(`\n🚀 Loaded ${modules.length} module(s): ${modules.join(', ')}\n`);
  } catch (error) {
    console.error('Error loading modules:', error);
  }
}

// Load all modules
await loadModules();

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

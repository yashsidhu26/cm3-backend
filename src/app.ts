import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { join } from 'path';
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
import testStreamingRoute from './modules/ai-integration/test-streaming-route';
import socialRoutes from './modules/social/social.routes';
import socialPublicRoutes from './modules/social/social.public.routes';
import gmailAuthRoutes from './modules/gmail-auth/gmail-auth.routes';
import studentProfileRoutes from './modules/student-profile/student-profile.routes';
import skillsInterestsRoutes from './modules/skills-interests/skills-interests.routes';
import brainRoutes from './modules/brain/brain.routes';
import smartScheduleRoutes from './modules/smart-schedule/smart-schedule.routes';
import paymentsPublicRoutes from './modules/payments/payments.public.routes';

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

// Mount test streaming route BEFORE ANY MIDDLEWARE
// This bypasses ALL middleware and module mounting system
app.post('/direct-test-stream', async (c) => {
  console.log('[DirectTest] Starting stream');

  return streamSSE(c, async (stream) => {
    try {
      const projectId = process.env.GCP_PROJECT_ID || 'vivid-spot-311815';
      const { VertexAI } = await import('@google-cloud/vertexai');

      const vertexAI = new VertexAI({
        project: projectId,
        location: 'global',
      });

      const model = vertexAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
      });

      const startTime = Date.now();
      const streamResult = await model.generateContentStream(
        'Write a short story about a robot. About 200 words.'
      );

      let chunkIndex = 0;
      for await (const chunk of streamResult.stream) {
        const receiveTime = Date.now();
        chunkIndex++;
        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;

        if (chunkText) {
          const elapsed = receiveTime - startTime;
          console.log(`[DirectTest] Chunk #${chunkIndex} at +${elapsed}ms`);

          await stream.writeSSE({
            event: 'chunk',
            data: JSON.stringify({ text: chunkText, chunkIndex }),
          });
        }
      }

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ totalChunks: chunkIndex }),
      });

    } catch (error: any) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: error.message }),
      });
    }
  });
});

// CORS - MUST BE FIRST for all routes including streaming
app.use('*', cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080',
  ].filter((url): url is string => !!url),
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposeHeaders: ['Set-Cookie'],
}));

// STREAMING ENDPOINTS: Skip certain middleware
const isStreamingEndpoint = (path: string) => {
  return path.includes('/test-stream') || path.includes('/direct-test');
};

// Test-only endpoints that don't need auth
const isUnauthenticatedTestEndpoint = (path: string) => {
  return path.includes('/test-stream') || path.includes('/direct-test');
};

// Authentication - inject user for ALL routes except test endpoints
app.use('*', async (c, next) => {
  if (isUnauthenticatedTestEndpoint(c.req.path)) {
    return next();
  }
  return injectUser(c, next);
});

// Logger - SKIP FOR ALL STREAMING ENDPOINTS (they have their own logging)
app.use('*', async (c, next) => {
  if (isStreamingEndpoint(c.req.path)) {
    return next();
  }
  await logger()(c, next);
});

// PrettyJSON - SKIP FOR ALL STREAMING ENDPOINTS (SSE must not be formatted)
app.use('*', async (c, next) => {
  if (isStreamingEndpoint(c.req.path)) {
    return next();
  }
  return prettyJSON()(c, next);
});

const staticRoot = join(import.meta.dir, '..', 'site');
const staticHandler = serveStatic({ root: staticRoot });
const isApiPath = (path: string) => {
  return (
    path.startsWith('/api') ||
    path.startsWith('/auth') ||
    path.startsWith('/health')
  );
};

// Health check endpoint
// Serve static files from 'site' directory (but NOT for API/streaming endpoints)
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (isApiPath(path) || isStreamingEndpoint(path)) {
    return next();
  }
  return staticHandler(c, next);
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
  { name: 'test-streaming', path: '/api/test', routes: testStreamingRoute },
  { name: 'social', path: '/api/social', routes: socialRoutes },
  { name: 'social-public', path: '/api', routes: socialPublicRoutes },
  { name: 'gmail-auth', path: '/auth', routes: gmailAuthRoutes },
  { name: 'student-profile', path: '/api/student-profile', routes: studentProfileRoutes },
  { name: 'skills-interests', path: '/api/skills-interests', routes: skillsInterestsRoutes },
  { name: 'brain', path: '/api/brain', routes: brainRoutes },
  { name: 'smart-schedule', path: '/api/smart-schedule', routes: smartScheduleRoutes },
  { name: 'payments-public', path: '/api', routes: paymentsPublicRoutes },
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

// Temporarily disable websocket to test if it's interfering with SSE
// import { websocket } from './core/utils/websocket';

export default {
  port: PORT,
  fetch: app.fetch,
  // websocket, // DISABLED FOR TESTING
  // Increase timeout for streaming endpoints (SSE can take longer)
  idleTimeout: 120, // 120 seconds (2 minutes)
};

console.log(`🔥 Server running on http://localhost:${PORT}`);
console.log(`📚 API Docs: http://localhost:${PORT}/api`);

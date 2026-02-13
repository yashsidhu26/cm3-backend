import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { aiIntegrationService } from './ai-integration.service';
import { chatRequestSchema, clearHistorySchema } from './ai-integration.schema';
import { promptCacheService } from './prompt-cache.service';

const app = new Hono();

/**
 * POST /api/ai-integration/chat
 * Main chat endpoint - processes user queries with dual AI system
 */
app.post('/chat', protect, zValidator('json', chatRequestSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
  }

  try {
    const { query, format, includeHistory } = c.req.valid('json');

    const historyLimit = 5;
    const history = includeHistory
      ? await aiIntegrationService.getConversationHistory(user.id, historyLimit)
      : [];

    // Process the query with Gemini agent
    const result = await aiIntegrationService.processQuery(user.id, query, history, format);

    // Save user message
    await aiIntegrationService.saveConversation(user.id, {
      role: 'user',
      content: query,
      timestamp: new Date(),
    });

    // Save AI response with metadata
    await aiIntegrationService.saveAIResponse(
      user.id,
      {
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      },
      result.source,
      result.complexity,
      result.contextUsed || [],
      result.toolsUsed,
      result.iterations,
      result.metadata.totalToolCalls
    );

    return successResponse(c, {
      ...result,
      message: 'Query processed successfully',
    });
  } catch (error: any) {
    console.error('[AI Routes] Error processing chat:', error);

    // Import AgentError dynamically
    const { AgentError } = await import('./agent/agent-loop');
    if (error instanceof AgentError) {
      return errorResponse(c, error.message, error.statusCode, error.code);
    }

    return errorResponse(
      c,
      'Failed to process query',
      500,
      'AI_PROCESSING_ERROR'
    );
  }
});

/**
 * POST /api/ai-integration/chat-stream
 * Deprecated: streaming is handled directly by the isolated server on port 4444.
 */
app.post('/chat-stream', protect, async (c) => {
  return errorResponse(
    c,
    'Streaming has moved to the isolated server on port 4444. Use http://localhost:4444/stream directly.',
    410,
    'STREAMING_MOVED'
  );
});

/**
 * GET /api/ai-integration/history
 * Get conversation history for the authenticated user
 */
app.get('/history', protect, async (c) => {
  const user = c.get('user');
  if (!user) {
    return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
  }

  try {
    const limit = Number(c.req.query('limit')) || 50;

    if (limit < 1 || limit > 200) {
      return errorResponse(c, 'Limit must be between 1 and 200', 400, 'INVALID_LIMIT');
    }

    const history = await aiIntegrationService.getConversationHistory(user.id, limit);

    return successResponse(c, {
      history,
      count: history.length,
      message: 'Conversation history retrieved successfully',
    });
  } catch (error: any) {
    console.error('[AI Routes] Error fetching history:', error);
    return errorResponse(
      c,
      'Failed to fetch conversation history',
      500,
      'FETCH_HISTORY_ERROR'
    );
  }
});

/**
 * DELETE /api/ai-integration/history
 * Clear conversation history for the authenticated user
 */
app.delete('/history', protect, async (c) => {
  const user = c.get('user');
  if (!user) {
    return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
  }

  try {
    await aiIntegrationService.clearConversation(user.id);

    return successResponse(c, {
      message: 'Conversation history cleared successfully',
    });
  } catch (error: any) {
    console.error('[AI Routes] Error clearing history:', error);
    return errorResponse(
      c,
      'Failed to clear conversation history',
      500,
      'CLEAR_HISTORY_ERROR'
    );
  }
});

/**
 * GET /api/ai-integration/stats
 * Get AI usage statistics for the authenticated user
 */
app.get('/stats', protect, async (c) => {
  const user = c.get('user');
  if (!user) {
    return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
  }

  try {
    const days = Number(c.req.query('days')) || 7;

    if (days < 1 || days > 90) {
      return errorResponse(c, 'Days must be between 1 and 90', 400, 'INVALID_DAYS');
    }

    const stats = await aiIntegrationService.getUserStats(user.id, days);

    if (!stats) {
      return errorResponse(c, 'Failed to retrieve stats', 500, 'STATS_ERROR');
    }

    return successResponse(c, {
      ...stats,
      message: 'Usage statistics retrieved successfully',
    });
  } catch (error: any) {
    console.error('[AI Routes] Error fetching stats:', error);
    return errorResponse(
      c,
      'Failed to fetch usage statistics',
      500,
      'FETCH_STATS_ERROR'
    );
  }
});

/**
 * GET /api/ai-integration/health
 * Health check endpoint for AI services
 */
app.get('/health', async (c) => {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    return successResponse(c, {
      status: 'healthy',
      services: {
        groq: groqKey ? 'configured' : 'missing',
        gemini: geminiKey ? 'configured' : 'missing',
      },
      message: 'AI integration service is operational',
    });
  } catch (error: any) {
    return errorResponse(c, 'Health check failed', 500, 'HEALTH_CHECK_ERROR');
  }
});

/**
 * GET /api/ai-integration/cache-status
 * Get prompt cache statistics and info
 * Vertex AI automatically caches systemInstruction content
 */
app.get('/cache-status', async (c) => {
  try {
    const stats = promptCacheService.getCacheStats();
    return successResponse(c, {
      ...stats,
      info: {
        howItWorks: 'Vertex AI automatically caches systemInstruction when > 2048 tokens',
        cacheDuration: '1 hour (managed by Vertex AI)',
        staticPromptSize: `${Math.round(stats.staticPromptSize / 1024)} KB`,
        estimatedTokens: stats.estimatedTokens,
        estimatedSavings: stats.cachingActive ? '~85% on input tokens after first request per hour' : 'N/A',
      },
    });
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to get cache status', 500);
  }
});

export default app;

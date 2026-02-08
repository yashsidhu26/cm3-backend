import { Hono } from 'hono';
import { brainService } from './brain.service';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { protect } from '../../core/auth/middleware';

const router = new Hono();

// Apply protection to all brain routes
router.use('*', protect);

// Schema for node creation
const createNodeSchema = z.object({
    name: z.string(),
    type: z.enum(['core', 'niche', 'suggestion']).default('niche'),
    val: z.number().default(10),
    metadata: z.record(z.any()).optional(),
});

// Schema for link creation
const createLinkSchema = z.object({
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    dashed: z.boolean().default(false),
    metadata: z.record(z.any()).optional(),
});

// Schema for source connection
const connectSourceSchema = z.object({
    nodeId: z.string().uuid(),
    type: z.enum(['youtube', 'drive', 'pinterest', 'goodreads', 'link']),
    title: z.string(),
    url: z.string().url().optional(),
    date: z.string().optional(),
    metadata: z.record(z.any()).optional(),
});

// Schema for chat
const chatSchema = z.object({
    message: z.string(),
    contextId: z.string().uuid(),
    type: z.enum(['node', 'source']),
});

/**
 * GET /graph
 * Returns complete graph data for the authenticated user
 */
router.get('/graph', async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const graphData = await brainService.getGraphData(userId);
    return c.json(graphData);
});

/**
 * GET /nodes/:id
 * Returns details for a specific node
 */
router.get('/nodes/:id', async (c) => {
    const id = c.req.param('id');
    try {
        const details = await brainService.getNodeDetails(id);
        return c.json(details);
    } catch (error: any) {
        return c.json({ error: error.message }, 404);
    }
});

/**
 * POST /nodes
 * Adds a new interest node
 */
router.post('/nodes', zValidator('json', createNodeSchema), async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const data = c.req.valid('json');
    const node = await brainService.addNode({ ...data, userId });
    return c.json(node, 201);
});

/**
 * POST /links
 * Adds a connection between nodes
 */
router.post('/links', zValidator('json', createLinkSchema), async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const data = c.req.valid('json');
    const link = await brainService.addLink({ ...data, userId });
    return c.json(link, 201);
});

/**
 * POST /suggest
 * Triggers AI suggestion generation
 */
router.post('/suggest', async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const suggestions = await brainService.generateSuggestions(userId);
    return c.json(suggestions);
});

/**
 * POST /sources
 * Connects a source to a node
 */
router.post('/sources', zValidator('json', connectSourceSchema), async (c) => {
    const data = c.req.valid('json');
    const source = await brainService.connectSource(data);
    return c.json(source, 201);
});

/**
 * POST /sources/:id/analyze
 * Triggers AI analysis for a source
 */
router.post('/sources/:id/analyze', async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    try {
        const analysis = await brainService.analyzeSource(id, userId);
        return c.json(analysis);
    } catch (error: any) {
        return c.json({ error: error.message }, 404);
    }
});

/**
 * POST /sources/:id/ingest
 * Triggers vector ingestion and serendipity check
 */
router.post('/sources/:id/ingest', async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    try {
        const result = await brainService.ingestSource(id, userId);
        return c.json(result);
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * POST /chat
 * Topic-aware chat with AI
 */
router.post('/chat', zValidator('json', chatSchema), async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const { message, contextId, type } = c.req.valid('json');
    try {
        const response = await brainService.chat(userId, message, contextId, type);
        return c.json(response);
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

/**
 * GET /nodes/:id/explore
 * Personalized "What's New" recommendations
 */
router.get('/nodes/:id/explore', async (c) => {
    const userId = c.get('user')?.id;
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    try {
        const exploration = await brainService.getExploration(userId, id);
        return c.json(exploration);
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

export default router;

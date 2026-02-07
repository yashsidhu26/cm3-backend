import { Hono } from 'hono';
import productivityRoutes from './modules/productivity/productivity.routes';

const app = new Hono();

// Mount routes as requested
app.route('/api/ai', productivityRoutes);

// Export for use with Bun or Hono's default behavior
export default app;

console.log('Productivity API Routes initialized at /api/ai');

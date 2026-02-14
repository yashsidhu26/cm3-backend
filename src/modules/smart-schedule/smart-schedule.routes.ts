import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { protect } from '../../core/auth/middleware';
import { successResponse, errorResponse } from '../../core/utils/response';
import { smartScheduleService } from './smart-schedule.service';
import { optimizeDaySchema, editScheduleSchema } from './smart-schedule.schema';

const app = new Hono();

/**
 * POST /api/smart-schedule/optimize-day
 * Create a new optimized daily schedule (non-streaming)
 */
app.post('/optimize-day', protect, zValidator('json', optimizeDaySchema), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
    }

    console.log('[SmartSchedule] optimize-day request');
    const data = c.req.valid('json');
    const result = await smartScheduleService.optimizeDay(user.id, data);

    return successResponse(c, result);
  } catch (error: any) {
    console.error('[SmartSchedule] optimize-day failed:', error);
    return errorResponse(c, error.message || 'Failed to optimize schedule', 500);
  }
});

/**
 * POST /api/smart-schedule/edit
 * Edit an existing schedule by scheduleId with AI instructions (non-streaming)
 */
app.post('/edit', protect, zValidator('json', editScheduleSchema), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
    }

    console.log('[SmartSchedule] edit request');
    const data = c.req.valid('json');
    const result = await smartScheduleService.editSchedule(user.id, data);

    return successResponse(c, result);
  } catch (error: any) {
    console.error('[SmartSchedule] edit failed:', error);
    return errorResponse(c, error.message || 'Failed to edit schedule', 500);
  }
});

export default app;

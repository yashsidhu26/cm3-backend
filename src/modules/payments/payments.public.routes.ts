import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { protect } from '../../core/auth/middleware';
import { parseUtcIsoInput } from '../../core/utils/datetime';
import { createdResponse, errorResponse, successResponse } from '../../core/utils/response';
import { paymentsService } from './payments.service';

const paymentsPublic = new Hono();

const addFriendSchema = z.object({
  friendId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
});

const createDirectExpenseSchema = z.object({
  description: z.string().min(1).max(500),
  total_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  payer_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  splits: z.array(z.object({
    user_id: z.string().uuid(),
    share_amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  })).min(1),
});

paymentsPublic.get('/payments/summary', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const summary = await paymentsService.getSummary(currentUser.id);
    return successResponse(c, summary);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to fetch summary', 500);
  }
});

paymentsPublic.post('/friends/add', protect, zValidator('json', addFriendSchema), async (c) => {
  try {
    const currentUser = c.get('user');
    const payload = c.req.valid('json');

    let friendId = payload.friendId;
    if (!friendId && payload.name) {
      const matches = await paymentsService.searchUsersByName(payload.name, currentUser.id);
      const exact = matches.find((m) => m.name.toLowerCase() === payload.name!.toLowerCase());
      const picked = exact || matches[0];
      if (!picked) {
        return errorResponse(c, 'No user found for that name', 404);
      }
      friendId = picked.id;
    }

    if (!friendId) return errorResponse(c, 'Provide either friendId or name', 400);

    const request = await paymentsService.sendFriendRequest(currentUser.id, friendId);
    return createdResponse(c, { friend_request: request });
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to add friend', 500);
  }
});

paymentsPublic.post('/expenses', protect, zValidator('json', createDirectExpenseSchema), async (c) => {
  try {
    const currentUser = c.get('user');
    const payload = c.req.valid('json');

    const created = await paymentsService.createDirectExpense({
      description: payload.description,
      totalAmount: payload.total_amount,
      payerId: payload.payer_id,
      createdBy: currentUser.id,
      date: payload.date ? parseUtcIsoInput(payload.date) : undefined,
      splits: payload.splits.map((s) => ({ userId: s.user_id, shareAmount: s.share_amount })),
    });

    return createdResponse(c, created);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to create expense', 500);
  }
});

paymentsPublic.get('/friends/balances', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const balances = await paymentsService.getFriendBalances(currentUser.id);
    return successResponse(c, balances);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to fetch friend balances', 500);
  }
});

paymentsPublic.post('/payments/settle/:friendId', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const friendId = c.req.param('friendId');
    const settled = await paymentsService.settleWithFriend(currentUser.id, friendId);
    return successResponse(c, settled);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to settle balances', 500);
  }
});

paymentsPublic.get('/expenses/recent', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const page = Math.max(1, Number(c.req.query('page') || '1'));
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query('page_size') || '10')));
    const expenses = await paymentsService.getRecentDirectExpenses(currentUser.id, page, pageSize);
    return successResponse(c, { items: expenses, page, page_size: pageSize });
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to fetch recent expenses', 500);
  }
});

export default paymentsPublic;

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { protect } from '../../core/auth/middleware';
import { parseUtcIsoInput } from '../../core/utils/datetime';
import { createdResponse, errorResponse, successResponse } from '../../core/utils/response';
import { socialService } from './social.service';

const socialPublic = new Hono();

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['clubs', 'depts', 'friends']).optional(),
});

const hostEventSchema = z.object({
  group_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  start_time: z.string().datetime(),
  location: z.string().max(255).optional(),
});

socialPublic.post('/groups', protect, zValidator('json', createGroupSchema), async (c) => {
  try {
    const currentUser = c.get('user');
    const data = c.req.valid('json');
    const result = await socialService.createGroupWithAdmin({
      name: data.name,
      description: data.description,
      type: data.type,
      createdBy: currentUser.id,
    });

    const origin = new URL(c.req.url).origin;
    return createdResponse(c, {
      id: result.group.id,
      name: result.group.name,
      type: result.group.type,
      invite_token: result.group.inviteToken,
      invite_url: `${origin}/invite/${result.group.inviteToken}`,
      user_role: 'Admin',
    });
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to create group', 500);
  }
});

socialPublic.get('/groups', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const search = c.req.query('search');
    const type = (c.req.query('type') || 'all') as 'all' | 'clubs' | 'depts' | 'friends';
    const groups = await socialService.getGroupsFeed(currentUser.id, search, type);
    return successResponse(c, groups);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to fetch groups', 500);
  }
});

socialPublic.post('/groups/join/:invite_token', protect, async (c) => {
  try {
    const currentUser = c.get('user');
    const inviteToken = c.req.param('invite_token');
    const group = await socialService.joinGroupByInviteToken(currentUser.id, inviteToken);
    return successResponse(c, {
      group_id: group.id,
      name: group.name,
      type: group.type,
      joined: true,
    });
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to join group', 400);
  }
});

socialPublic.post('/events', protect, zValidator('json', hostEventSchema), async (c) => {
  try {
    const currentUser = c.get('user');
    const payload = c.req.valid('json');

    const result = await socialService.hostGroupEvent({
      userId: currentUser.id,
      groupId: payload.group_id,
      title: payload.title,
      startTime: parseUtcIsoInput(payload.start_time),
      location: payload.location,
    });

    return createdResponse(c, result);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to create event', 403);
  }
});

socialPublic.get('/users/search', protect, async (c) => {
  try {
    const query = c.req.query('search') || '';
    const users = await socialService.searchUsers(query);
    return successResponse(c, users);
  } catch (error: any) {
    return errorResponse(c, error.message || 'Failed to search users', 500);
  }
});

export default socialPublic;

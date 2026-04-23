import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { socialService } from './social.service';
import { successResponse, errorResponse, createdResponse } from '../../core/utils/response';
import { protect } from '../../core/auth/middleware';
import { parseUtcIsoInput } from '../../core/utils/datetime';

/**
 * Social Module Routes
 * Complete API endpoints for all 6 social features
 */

const social = new Hono();

function parseUtcDateTime(input: string): Date {
  return parseUtcIsoInput(input);
}

// ==================== VALIDATION SCHEMAS ====================

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(255),
  description: z.string().optional(),
});

const createPostSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  groupId: z.string().uuid('Invalid group ID').optional(),
  title: z.string().min(1, 'Title is required').max(255).optional(),
  content: z.string().min(1, 'Content is required'),
});

const createCommentSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  userId: z.string().uuid('Invalid user ID'),
  content: z.string().min(1, 'Content is required'),
});

const createPositionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isAdmin: z.boolean().default(false),
  permissions: z.array(z.string()).optional(),
});

const assignPositionSchema = z.object({
  positionId: z.string().uuid().nullable(),
});

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  meetingDate: z.string().datetime().optional(),
  meetingLocation: z.string().max(255).optional(),
  isUrgent: z.boolean().default(false),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  description: z.string().optional(),
});

const assignTagSchema = z.object({
  tagId: z.string().uuid(),
});

const createPollSchema = z.object({
  question: z.string().min(1),
  options: z.array(
    z.object({
      text: z.string().min(1).max(255),
      order: z.number().int().min(0),
    })
  ).min(2, 'Poll must have at least 2 options'),
  isAnonymous: z.boolean().default(false),
  isMultipleChoice: z.boolean().default(false),
  endsAt: z.string().datetime().optional(),
});

const voteOnPollSchema = z.object({
  optionIds: z.array(z.string().uuid()).min(1, 'Must select at least one option'),
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  assignedTo: z.string().uuid(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

// ==================== GROUP ROUTES ====================

/**
 * POST /groups
 * Create a new group with the creator as admin
 * Requires authentication
 */
social.post('/groups', protect, zValidator('json', createGroupSchema), async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return errorResponse(c, 'User not authenticated', 401, 'UNAUTHORIZED');
    }

    const { name, description } = c.req.valid('json');

    const result = await socialService.createGroupWithAdmin({
      name,
      description,
      createdBy: user.id,
    });

    return createdResponse(c, {
      group: result.group,
      adminPosition: result.adminPosition,
      message: 'Group created successfully. You are now the admin.',
    });
  } catch (error: any) {
    console.error('Error creating group:', error);
    return errorResponse(c, 'Failed to create group', 500);
  }
});

// ==================== EXISTING POST ROUTES ====================

/**
 * GET /posts
 * Retrieve all posts
 */
social.get('/posts', async (c) => {
  try {
    const posts = await socialService.getAllPosts();
    return successResponse(c, {
      posts,
      count: posts.length,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return errorResponse(c, 'Failed to fetch posts', 500);
  }
});

/**
 * GET /posts/:id
 * Retrieve a specific post
 */
social.get('/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const post = await socialService.getPostById(id);

    if (!post) {
      return errorResponse(c, 'Post not found', 404, 'POST_NOT_FOUND');
    }

    return successResponse(c, { post });
  } catch (error) {
    console.error('Error fetching post:', error);
    return errorResponse(c, 'Failed to fetch post', 500);
  }
});

/**
 * POST /posts
 * Create a new post
 */
social.post('/posts', zValidator('json', createPostSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const post = await socialService.createPost(data);
    return createdResponse(c, { post });
  } catch (error) {
    console.error('Error creating post:', error);
    return errorResponse(c, 'Failed to create post', 500);
  }
});

/**
 * DELETE /posts/:id
 * Delete a post
 */
social.delete('/posts/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await socialService.deletePost(id);
    return successResponse(c, { message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return errorResponse(c, 'Failed to delete post', 500);
  }
});

/**
 * GET /posts/:id/comments
 * Get all comments for a post
 */
social.get('/posts/:id/comments', async (c) => {
  try {
    const postId = c.req.param('id');
    const comments = await socialService.getPostComments(postId);

    return successResponse(c, {
      postId,
      comments,
      count: comments.length,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return errorResponse(c, 'Failed to fetch comments', 500);
  }
});

/**
 * POST /comments
 * Create a new comment
 */
social.post('/comments', zValidator('json', createCommentSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const comment = await socialService.createComment(data);
    return createdResponse(c, { comment });
  } catch (error) {
    console.error('Error creating comment:', error);
    return errorResponse(c, 'Failed to create comment', 500);
  }
});

/**
 * GET /users/:id/posts
 * Get all posts by a specific user
 */
social.get('/users/:id/posts', async (c) => {
  try {
    const userId = c.req.param('id');
    const posts = await socialService.getUserPosts(userId);

    return successResponse(c, {
      userId,
      posts,
      count: posts.length,
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    return errorResponse(c, 'Failed to fetch user posts', 500);
  }
});

// ==================== RBAC ROUTES ====================

/**
 * POST /groups/:groupId/positions
 * Create a new position in a group
 */
social.post('/groups/:groupId/positions', zValidator('json', createPositionSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const data = c.req.valid('json');

    // TODO: Get authenticated user from context
    const createdBy = c.req.header('x-user-id') || '';

    // Check if user has permission
    const hasPermission = await socialService.hasPermission(createdBy, groupId, 'manage_positions');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions', 403, 'FORBIDDEN');
    }

    const position = await socialService.createPosition({
      groupId,
      createdBy,
      ...data,
    });

    return createdResponse(c, { position });
  } catch (error) {
    console.error('Error creating position:', error);
    return errorResponse(c, 'Failed to create position', 500);
  }
});

/**
 * GET /groups/:groupId/positions
 * Get all positions in a group
 */
social.get('/groups/:groupId/positions', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const positions = await socialService.getGroupPositions(groupId);

    return successResponse(c, {
      positions,
      count: positions.length,
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return errorResponse(c, 'Failed to fetch positions', 500);
  }
});

/**
 * POST /groups/:groupId/members/:userId/assign-position
 * Assign a position to a group member
 */
social.post('/groups/:groupId/members/:userId/assign-position', zValidator('json', assignPositionSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const userId = c.req.param('userId');
    const { positionId } = c.req.valid('json');

    // TODO: Get authenticated user from context
    const assignerId = c.req.header('x-user-id') || '';

    // Check if assigner has permission (must be admin)
    const hasPermission = await socialService.hasPermission(assignerId, groupId, 'assign_roles');
    if (!hasPermission) {
      return errorResponse(c, 'Only admins can assign positions', 403, 'FORBIDDEN');
    }

    const membership = await socialService.assignPosition(groupId, userId, positionId);

    return successResponse(c, { membership });
  } catch (error) {
    console.error('Error assigning position:', error);
    return errorResponse(c, 'Failed to assign position', 500);
  }
});

/**
 * GET /groups/:groupId/members
 * Get all members of a group with their positions
 */
social.get('/groups/:groupId/members', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const members = await socialService.getGroupMembers(groupId);

    return successResponse(c, {
      members,
      count: members.length,
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return errorResponse(c, 'Failed to fetch members', 500);
  }
});

// ==================== ANNOUNCEMENT ROUTES ====================

/**
 * POST /groups/:groupId/announcements
 * Create an announcement
 */
social.post('/groups/:groupId/announcements', zValidator('json', createAnnouncementSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const data = c.req.valid('json');

    // TODO: Get authenticated user from context
    const userId = c.req.header('x-user-id') || '';

    // Check permission
    const hasPermission = await socialService.hasPermission(userId, groupId, 'create_announcements');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions to create announcements', 403, 'FORBIDDEN');
    }

    const result = await socialService.createAnnouncement({
      groupId,
      userId,
      ...data,
      meetingDate: data.meetingDate ? parseUtcDateTime(data.meetingDate) : undefined,
    });

    return createdResponse(c, result);
  } catch (error) {
    console.error('Error creating announcement:', error);
    return errorResponse(c, 'Failed to create announcement', 500);
  }
});

/**
 * GET /groups/:groupId/announcements
 * Get all announcements for a group
 */
social.get('/groups/:groupId/announcements', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const isUrgent = c.req.query('is_urgent');

    const announcements = await socialService.getGroupAnnouncements(
      groupId,
      isUrgent === 'true' ? true : isUrgent === 'false' ? false : undefined
    );

    return successResponse(c, {
      announcements,
      count: announcements.length,
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return errorResponse(c, 'Failed to fetch announcements', 500);
  }
});

// ==================== MEMBER & INTRO ROUTES ====================

/**
 * POST /groups/:groupId/members
 * Add a member to a group (auto-creates intro post)
 */
social.post('/groups/:groupId/members', zValidator('json', addMemberSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const { userId } = c.req.valid('json');

    // TODO: Get authenticated user from context
    const addedBy = c.req.header('x-user-id') || '';

    const membership = await socialService.addMemberToGroup(groupId, userId, addedBy);

    return createdResponse(c, { membership });
  } catch (error) {
    console.error('Error adding member:', error);
    return errorResponse(c, 'Failed to add member', 500);
  }
});

/**
 * POST /groups/:groupId/intro
 * User creates their own introduction post
 */
social.post('/groups/:groupId/intro', zValidator('json', z.object({ content: z.string().min(1) })), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const { content } = c.req.valid('json');

    // TODO: Get authenticated user from context
    const userId = c.req.header('x-user-id') || '';

    const result = await socialService.createIntroPost({
      groupId,
      introducedUserId: userId,
      addedByUserId: userId, // Self-intro
    });

    return createdResponse(c, result);
  } catch (error) {
    console.error('Error creating intro:', error);
    return errorResponse(c, 'Failed to create intro', 500);
  }
});

// ==================== TAG ROUTES ====================

/**
 * POST /groups/:groupId/tags
 * Create a tag
 */
social.post('/groups/:groupId/tags', zValidator('json', createTagSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const data = c.req.valid('json');

    // TODO: Get authenticated user from context
    const createdBy = c.req.header('x-user-id') || '';

    // Check permission
    const hasPermission = await socialService.hasPermission(createdBy, groupId, 'manage_tags');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions to manage tags', 403, 'FORBIDDEN');
    }

    const tag = await socialService.createTag({
      groupId,
      createdBy,
      ...data,
    });

    return createdResponse(c, { tag });
  } catch (error) {
    console.error('Error creating tag:', error);
    return errorResponse(c, 'Failed to create tag', 500);
  }
});

/**
 * GET /groups/:groupId/tags
 * Get all tags in a group
 */
social.get('/groups/:groupId/tags', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const tags = await socialService.getGroupTags(groupId);

    return successResponse(c, {
      tags,
      count: tags.length,
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return errorResponse(c, 'Failed to fetch tags', 500);
  }
});

/**
 * POST /groups/:groupId/members/:userId/tags
 * Assign a tag to a member
 */
social.post('/groups/:groupId/members/:userId/tags', zValidator('json', assignTagSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const userId = c.req.param('userId');
    const { tagId } = c.req.valid('json');

    // TODO: Get authenticated user from context
    const assignedBy = c.req.header('x-user-id') || '';

    // Check permission
    const hasPermission = await socialService.hasPermission(assignedBy, groupId, 'assign_tags');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions to assign tags', 403, 'FORBIDDEN');
    }

    const userTag = await socialService.assignTag({
      userId,
      tagId,
      groupId,
      assignedBy,
    });

    return createdResponse(c, { userTag });
  } catch (error) {
    console.error('Error assigning tag:', error);
    return errorResponse(c, 'Failed to assign tag', 500);
  }
});

/**
 * DELETE /groups/:groupId/members/:userId/tags/:tagId
 * Remove a tag from a member
 */
social.delete('/groups/:groupId/members/:userId/tags/:tagId', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const userId = c.req.param('userId');
    const tagId = c.req.param('tagId');

    // TODO: Get authenticated user from context
    const requesterId = c.req.header('x-user-id') || '';

    // Check permission
    const hasPermission = await socialService.hasPermission(requesterId, groupId, 'assign_tags');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions', 403, 'FORBIDDEN');
    }

    await socialService.removeTag(userId, tagId, groupId);

    return successResponse(c, { message: 'Tag removed successfully' });
  } catch (error) {
    console.error('Error removing tag:', error);
    return errorResponse(c, 'Failed to remove tag', 500);
  }
});

/**
 * GET /groups/:groupId/members/by-tags
 * Filter members by tags
 */
social.get('/groups/:groupId/members/by-tags', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const tagIdsParam = c.req.query('tags');

    if (!tagIdsParam) {
      return errorResponse(c, 'Tag IDs are required', 400, 'MISSING_TAGS');
    }

    const tagIds = tagIdsParam.split(',');
    const members = await socialService.getMembersByTags(groupId, tagIds);

    return successResponse(c, {
      members,
      count: members.length,
    });
  } catch (error) {
    console.error('Error filtering members by tags:', error);
    return errorResponse(c, 'Failed to filter members', 500);
  }
});

/**
 * GET /groups/:groupId/members/:userId/tags
 * Get tags for a specific user in a group
 */
social.get('/groups/:groupId/members/:userId/tags', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const userId = c.req.param('userId');

    const tags = await socialService.getUserTags(userId, groupId);

    return successResponse(c, {
      tags,
      count: tags.length,
    });
  } catch (error) {
    console.error('Error fetching user tags:', error);
    return errorResponse(c, 'Failed to fetch user tags', 500);
  }
});

// ==================== POLL ROUTES ====================

/**
 * POST /groups/:groupId/polls
 * Create a poll
 */
social.post('/groups/:groupId/polls', zValidator('json', createPollSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const data = c.req.valid('json');

    // TODO: Get authenticated user from context
    const userId = c.req.header('x-user-id') || '';

    const result = await socialService.createPoll({
      groupId,
      userId,
      ...data,
      endsAt: data.endsAt ? parseUtcDateTime(data.endsAt) : undefined,
    });

    return createdResponse(c, result);
  } catch (error) {
    console.error('Error creating poll:', error);
    return errorResponse(c, 'Failed to create poll', 500);
  }
});

/**
 * POST /polls/:pollId/vote
 * Vote on a poll
 */
social.post('/polls/:pollId/vote', zValidator('json', voteOnPollSchema), async (c) => {
  try {
    const pollId = c.req.param('pollId');
    const { optionIds } = c.req.valid('json');

    // TODO: Get authenticated user from context
    const userId = c.req.header('x-user-id') || '';

    const result = await socialService.voteOnPoll(pollId, userId, optionIds);

    return successResponse(c, result);
  } catch (error: any) {
    console.error('Error voting on poll:', error);
    return errorResponse(c, error.message || 'Failed to vote on poll', 400);
  }
});

/**
 * GET /polls/:pollId/results
 * Get poll results
 */
social.get('/polls/:pollId/results', async (c) => {
  try {
    const pollId = c.req.param('pollId');

    // TODO: Get authenticated user from context
    const userId = c.req.header('x-user-id');

    const results = await socialService.getPollResults(pollId, userId);

    return successResponse(c, results);
  } catch (error: any) {
    console.error('Error fetching poll results:', error);
    return errorResponse(c, error.message || 'Failed to fetch poll results', 500);
  }
});

// ==================== TASK & SCHEDULE ROUTES ====================

/**
 * POST /groups/:groupId/tasks
 * Create a task (auto-creates schedule entry)
 */
social.post('/groups/:groupId/tasks', zValidator('json', createTaskSchema), async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const data = c.req.valid('json');

    // TODO: Get authenticated user from context
    const assignedBy = c.req.header('x-user-id') || '';

    // Check permission
    const hasPermission = await socialService.hasPermission(assignedBy, groupId, 'assign_tasks');
    if (!hasPermission) {
      return errorResponse(c, 'Insufficient permissions to assign tasks', 403, 'FORBIDDEN');
    }

    const result = await socialService.createTask({
      groupId,
      assignedBy,
      ...data,
      dueDate: data.dueDate ? parseUtcDateTime(data.dueDate) : undefined,
    });

    return createdResponse(c, result);
  } catch (error) {
    console.error('Error creating task:', error);
    return errorResponse(c, 'Failed to create task', 500);
  }
});

/**
 * PUT /tasks/:taskId
 * Update a task (syncs with schedule)
 */
social.put('/tasks/:taskId', zValidator('json', updateTaskSchema), async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const data = c.req.valid('json');

    const updates: any = { ...data };
    if (data.dueDate) {
      updates.dueDate = parseUtcDateTime(data.dueDate);
    }

    const task = await socialService.updateTask(taskId, updates);

    return successResponse(c, { task });
  } catch (error) {
    console.error('Error updating task:', error);
    return errorResponse(c, 'Failed to update task', 500);
  }
});

/**
 * DELETE /tasks/:taskId
 * Delete a task (cascades to schedule)
 */
social.delete('/tasks/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');

    await socialService.deleteTask(taskId);

    return successResponse(c, { message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    return errorResponse(c, 'Failed to delete task', 500);
  }
});

/**
 * GET /groups/:groupId/tasks
 * Get all tasks for a group
 */
social.get('/groups/:groupId/tasks', async (c) => {
  try {
    const groupId = c.req.param('groupId');
    const assignedTo = c.req.query('assigned_to');
    const status = c.req.query('status');

    const tasks = await socialService.getGroupTasks(groupId, {
      assignedTo,
      status,
    });

    return successResponse(c, {
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return errorResponse(c, 'Failed to fetch tasks', 500);
  }
});

/**
 * GET /users/:userId/schedule
 * Get user's schedule
 */
social.get('/users/:userId/schedule', async (c) => {
  try {
    const userId = c.req.param('userId');
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');

    const schedule = await socialService.getUserSchedule(
      userId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    return successResponse(c, {
      schedule,
      count: schedule.length,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return errorResponse(c, 'Failed to fetch schedule', 500);
  }
});

export default social;

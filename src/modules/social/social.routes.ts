import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { socialService } from './social.service';
import { successResponse, errorResponse, createdResponse } from '../../core/utils/response';

/**
 * Social Module Routes
 * Handles all social feature endpoints
 */

const social = new Hono();

// Validation schemas
const createPostSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().min(1, 'Content is required'),
});

const createCommentSchema = z.object({
  postId: z.string().uuid('Invalid post ID'),
  userId: z.string().uuid('Invalid user ID'),
  content: z.string().min(1, 'Content is required'),
});

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

export default social;

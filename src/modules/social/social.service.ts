import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../core/database/client';
import { posts, comments, type Post, type NewPost, type Comment, type NewComment } from './social.schema';
import { user } from '../auth/auth.schema';

/**
 * Social Service
 * Business logic for social features
 */

export class SocialService {
  /**
   * Get all posts with user information
   */
  async getAllPosts() {
    return await db
      .select({
        post: posts,
        user: {
          id: user.id,
          name: user.name,
          bitsId: user.bitsId,
        },
      })
      .from(posts)
      .innerJoin(user, eq(posts.userId, user.id))
      .orderBy(desc(posts.createdAt));
  }

  /**
   * Get post by ID
   */
  async getPostById(id: string) {
    const result = await db
      .select({
        post: posts,
        user: {
          id: user.id,
          name: user.name,
          bitsId: user.bitsId,
        },
      })
      .from(posts)
      .innerJoin(user, eq(posts.userId, user.id))
      .where(eq(posts.id, id));
    
    return result[0];
  }

  /**
   * Create a new post
   */
  async createPost(data: NewPost): Promise<Post> {
    const result = await db.insert(posts).values(data).returning();
    return result[0];
  }

  /**
   * Get comments for a post
   */
  async getPostComments(postId: string) {
    return await db
      .select({
        comment: comments,
        user: {
          id: user.id,
          name: user.name,
          bitsId: user.bitsId,
        },
      })
      .from(comments)
      .innerJoin(user, eq(comments.userId, user.id))
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt));
  }

  /**
   * Create a comment on a post
   */
  async createComment(data: NewComment): Promise<Comment> {
    const result = await db.insert(comments).values(data).returning();
    
    // Increment comment count on post using SQL
    await db
      .update(posts)
      .set({ commentsCount: sql`${posts.commentsCount} + 1` })
      .where(eq(posts.id, data.postId));
    
    return result[0];
  }

  /**
   * Get posts by user
   */
  async getUserPosts(userId: string) {
    return await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  }

  /**
   * Delete a post
   */
  async deletePost(id: string): Promise<void> {
    await db.delete(posts).where(eq(posts.id, id));
  }
}

// Export singleton instance
export const socialService = new SocialService();

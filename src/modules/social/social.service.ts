import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { db } from '../../core/database/client';
import {
  posts,
  comments,
  positions,
  positionPermissions,
  groupMembership,
  announcements,
  introPosts,
  tags,
  userTags,
  polls,
  pollOptions,
  pollVotes,
  anonymousPollVotes,
  tasks,
  schedules,
  type Post,
  type NewPost,
  type Comment,
  type NewComment,
  type Position,
  type NewPosition,
  type GroupMembership,
  type Announcement,
  type Tag,
  type Poll,
  type PollOption,
  type Task,
  type Schedule,
} from './social.schema';
import { user } from '../auth/auth.schema';
import { groups } from '../payments/payments.schema';

/**
 * Social Service
 * Comprehensive business logic for all social features
 */

export class SocialService {
  // ==================== EXISTING POST METHODS ====================

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

  // ==================== GROUP MANAGEMENT ====================

  /**
   * Create a group with the creator as admin
   * This creates:
   * 1. The group
   * 2. Adds creator as member
   * 3. Creates an "Admin" position with full permissions
   * 4. Assigns the admin position to the creator
   */
  async createGroupWithAdmin(data: {
    name: string;
    description?: string;
    createdBy: string;
  }) {
    // Import groups from payments schema
    const { groups } = await import('../payments/payments.schema');

    // 1. Create the group
    const groupResult = await db.insert(groups).values({
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
    }).returning();
    const group = groupResult[0];

    // 2. Add creator as member
    await db.insert(groupMembership).values({
      groupId: group.id,
      userId: data.createdBy,
    });

    // 3. Create admin position with full permissions
    const adminPermissions = [
      'assign_roles',
      'manage_positions',
      'create_announcements',
      'manage_tags',
      'assign_tags',
      'assign_tasks',
    ];

    const positionResult = await db.insert(positions).values({
      groupId: group.id,
      name: 'Admin',
      description: 'Group administrator with full permissions',
      isAdmin: true,
      createdBy: data.createdBy,
    }).returning();
    const adminPosition = positionResult[0];

    // Add permissions to the admin position
    for (const permissionKey of adminPermissions) {
      await db.insert(positionPermissions).values({
        positionId: adminPosition.id,
        permissionKey,
      });
    }

    // 4. Assign admin position to creator
    await db.update(groupMembership)
      .set({ positionId: adminPosition.id })
      .where(and(
        eq(groupMembership.groupId, group.id),
        eq(groupMembership.userId, data.createdBy)
      ));

    return {
      group,
      adminPosition,
      membership: {
        groupId: group.id,
        userId: data.createdBy,
        positionId: adminPosition.id,
      },
    };
  }

  // ==================== RBAC METHODS ====================

  /**
   * Create a new position in a group
   */
  async createPosition(data: {
    groupId: string;
    name: string;
    description?: string;
    isAdmin: boolean;
    createdBy: string;
    permissions?: string[];
  }): Promise<Position> {
    const position = await db
      .insert(positions)
      .values({
        groupId: data.groupId,
        name: data.name,
        description: data.description,
        isAdmin: data.isAdmin,
        createdBy: data.createdBy,
      })
      .returning();

    // Add permissions if provided
    if (data.permissions && data.permissions.length > 0) {
      await db.insert(positionPermissions).values(
        data.permissions.map((permissionKey) => ({
          positionId: position[0].id,
          permissionKey,
        }))
      );
    }

    return position[0];
  }

  /**
   * Get all positions in a group
   */
  async getGroupPositions(groupId: string) {
    const positionsData = await db
      .select()
      .from(positions)
      .where(eq(positions.groupId, groupId))
      .orderBy(desc(positions.isAdmin), positions.name);

    // Get permissions for each position
    const positionsWithPermissions = await Promise.all(
      positionsData.map(async (position) => {
        const perms = await db
          .select()
          .from(positionPermissions)
          .where(eq(positionPermissions.positionId, position.id));

        return {
          ...position,
          permissions: perms.map((p) => p.permissionKey),
        };
      })
    );

    return positionsWithPermissions;
  }

  /**
   * Assign a position to a group member
   */
  async assignPosition(groupId: string, userId: string, positionId: string | null) {
    const result = await db
      .update(groupMembership)
      .set({ positionId })
      .where(and(eq(groupMembership.groupId, groupId), eq(groupMembership.userId, userId)))
      .returning();

    return result[0];
  }

  /**
   * Check if a user has a specific permission in a group
   */
  async hasPermission(userId: string, groupId: string, permissionKey: string): Promise<boolean> {
    const membership = await db
      .select()
      .from(groupMembership)
      .where(and(eq(groupMembership.userId, userId), eq(groupMembership.groupId, groupId)));

    if (!membership[0] || !membership[0].positionId) {
      return false;
    }

    // Check if position is admin (admins have all permissions)
    const position = await db.select().from(positions).where(eq(positions.id, membership[0].positionId));

    if (position[0]?.isAdmin) {
      return true;
    }

    // Check specific permission
    const permission = await db
      .select()
      .from(positionPermissions)
      .where(
        and(eq(positionPermissions.positionId, membership[0].positionId), eq(positionPermissions.permissionKey, permissionKey))
      );

    return permission.length > 0;
  }

  /**
   * Get group members with their positions
   */
  async getGroupMembers(groupId: string) {
    return await db
      .select({
        membership: groupMembership,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          bitsId: user.bitsId,
        },
        position: positions,
      })
      .from(groupMembership)
      .innerJoin(user, eq(groupMembership.userId, user.id))
      .leftJoin(positions, eq(groupMembership.positionId, positions.id))
      .where(eq(groupMembership.groupId, groupId));
  }

  // ==================== ANNOUNCEMENT METHODS ====================

  /**
   * Create an announcement
   */
  async createAnnouncement(data: {
    groupId: string;
    userId: string;
    title: string;
    content: string;
    meetingDate?: Date;
    meetingLocation?: string;
    isUrgent?: boolean;
  }) {
    // Create post
    const post = await db
      .insert(posts)
      .values({
        groupId: data.groupId,
        userId: data.userId,
        title: data.title,
        content: data.content,
        postType: 'announcement',
        isPinned: true, // Auto-pin announcements
      })
      .returning();

    // Create announcement metadata
    const announcement = await db
      .insert(announcements)
      .values({
        postId: post[0].id,
        meetingDate: data.meetingDate,
        meetingLocation: data.meetingLocation,
        isUrgent: data.isUrgent || false,
      })
      .returning();

    return {
      post: post[0],
      announcement: announcement[0],
    };
  }

  /**
   * Get all announcements for a group
   */
  async getGroupAnnouncements(groupId: string, isUrgent?: boolean) {
    let query = db
      .select({
        post: posts,
        announcement: announcements,
        user: {
          id: user.id,
          name: user.name,
          bitsId: user.bitsId,
        },
      })
      .from(posts)
      .innerJoin(announcements, eq(posts.id, announcements.postId))
      .innerJoin(user, eq(posts.userId, user.id))
      .where(eq(posts.groupId, groupId));

    const results = await query.orderBy(desc(posts.createdAt));

    // Filter by urgency if specified
    if (isUrgent !== undefined) {
      return results.filter((r) => r.announcement.isUrgent === isUrgent);
    }

    return results;
  }

  // ==================== INTRO POST METHODS ====================

  /**
   * Create an intro post when a new member joins
   */
  async createIntroPost(data: { groupId: string; introducedUserId: string; addedByUserId: string }) {
    // Get user names
    const introducedUser = await db.select().from(user).where(eq(user.id, data.introducedUserId));
    const adderUser = await db.select().from(user).where(eq(user.id, data.addedByUserId));

    const content = `${adderUser[0]?.name || 'Someone'} added ${introducedUser[0]?.name || 'a new member'} to the group. Welcome!`;

    // Create post
    const post = await db
      .insert(posts)
      .values({
        groupId: data.groupId,
        userId: data.addedByUserId,
        title: 'New Member',
        content,
        postType: 'intro',
      })
      .returning();

    // Create intro metadata
    const introPost = await db
      .insert(introPosts)
      .values({
        postId: post[0].id,
        introducedUserId: data.introducedUserId,
        addedByUserId: data.addedByUserId,
      })
      .returning();

    return {
      post: post[0],
      introPost: introPost[0],
    };
  }

  /**
   * Add member to group (with auto intro post)
   */
  async addMemberToGroup(groupId: string, userId: string, addedBy: string) {
    // Add member
    const membership = await db
      .insert(groupMembership)
      .values({
        groupId,
        userId,
      })
      .returning();

    // Auto-create intro post
    await this.createIntroPost({
      groupId,
      introducedUserId: userId,
      addedByUserId: addedBy,
    });

    return membership[0];
  }

  // ==================== TAG METHODS ====================

  /**
   * Create a tag
   */
  async createTag(data: { groupId: string; name: string; color?: string; description?: string; createdBy: string }) {
    const tag = await db.insert(tags).values(data).returning();
    return tag[0];
  }

  /**
   * Get all tags in a group
   */
  async getGroupTags(groupId: string) {
    return await db.select().from(tags).where(eq(tags.groupId, groupId)).orderBy(tags.name);
  }

  /**
   * Assign a tag to a user
   */
  async assignTag(data: { userId: string; tagId: string; groupId: string; assignedBy: string }) {
    const userTag = await db.insert(userTags).values(data).returning();
    return userTag[0];
  }

  /**
   * Remove a tag from a user
   */
  async removeTag(userId: string, tagId: string, groupId: string) {
    await db
      .delete(userTags)
      .where(and(eq(userTags.userId, userId), eq(userTags.tagId, tagId), eq(userTags.groupId, groupId)));
  }

  /**
   * Get members by tags
   */
  async getMembersByTags(groupId: string, tagIds: string[]) {
    return await db
      .select({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          bitsId: user.bitsId,
        },
        tag: tags,
      })
      .from(user)
      .innerJoin(userTags, eq(user.id, userTags.userId))
      .innerJoin(tags, eq(userTags.tagId, tags.id))
      .where(and(eq(userTags.groupId, groupId), inArray(userTags.tagId, tagIds)));
  }

  /**
   * Get tags for a user in a group
   */
  async getUserTags(userId: string, groupId: string) {
    return await db
      .select({
        tag: tags,
      })
      .from(userTags)
      .innerJoin(tags, eq(userTags.tagId, tags.id))
      .where(and(eq(userTags.userId, userId), eq(userTags.groupId, groupId)));
  }

  // ==================== POLL METHODS ====================

  /**
   * Create a poll
   */
  async createPoll(data: {
    groupId: string;
    userId: string;
    question: string;
    options: { text: string; order: number }[];
    isAnonymous?: boolean;
    isMultipleChoice?: boolean;
    endsAt?: Date;
  }) {
    // Create post
    const post = await db
      .insert(posts)
      .values({
        groupId: data.groupId,
        userId: data.userId,
        content: data.question,
        postType: 'poll',
      })
      .returning();

    // Create poll
    const poll = await db
      .insert(polls)
      .values({
        postId: post[0].id,
        question: data.question,
        isAnonymous: data.isAnonymous || false,
        isMultipleChoice: data.isMultipleChoice || false,
        endsAt: data.endsAt,
      })
      .returning();

    // Create poll options
    const options = await db
      .insert(pollOptions)
      .values(
        data.options.map((opt) => ({
          pollId: poll[0].id,
          optionText: opt.text,
          displayOrder: opt.order,
        }))
      )
      .returning();

    return {
      post: post[0],
      poll: poll[0],
      options,
    };
  }

  /**
   * Vote on a poll
   */
  async voteOnPoll(pollId: string, userId: string, optionIds: string[]) {
    // Get poll details
    const pollData = await db.select().from(polls).where(eq(polls.id, pollId));
    const poll = pollData[0];

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check if poll has ended
    if (poll.endsAt && new Date() > poll.endsAt) {
      throw new Error('Poll has ended');
    }

    // Check if user already voted
    const existingVote = await db.select().from(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId)));

    if (existingVote.length > 0 && !poll.isMultipleChoice) {
      throw new Error('You have already voted on this poll');
    }

    if (poll.isAnonymous) {
      // ANONYMOUS POLL LOGIC
      // 1. Record that user voted (to prevent double voting)
      await db.insert(pollVotes).values({
        pollId,
        userId,
        optionId: null, // NULL for anonymous
      });

      // 2. Record the actual votes separately (no user link)
      for (const optionId of optionIds) {
        await db.insert(anonymousPollVotes).values({
          pollId,
          optionId,
        });

        // Increment vote count
        await db
          .update(pollOptions)
          .set({ voteCount: sql`${pollOptions.voteCount} + 1` })
          .where(eq(pollOptions.id, optionId));
      }
    } else {
      // NON-ANONYMOUS POLL LOGIC
      for (const optionId of optionIds) {
        await db.insert(pollVotes).values({
          pollId,
          userId,
          optionId,
        });

        // Increment vote count
        await db
          .update(pollOptions)
          .set({ voteCount: sql`${pollOptions.voteCount} + 1` })
          .where(eq(pollOptions.id, optionId));
      }
    }

    return { success: true };
  }

  /**
   * Get poll results
   */
  async getPollResults(pollId: string, requestingUserId?: string) {
    const pollData = await db.select().from(polls).where(eq(polls.id, pollId));
    const poll = pollData[0];

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Get options
    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId)).orderBy(pollOptions.displayOrder);

    // Check if requesting user has voted
    let userHasVoted = false;
    if (requestingUserId) {
      const userVote = await db
        .select()
        .from(pollVotes)
        .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, requestingUserId)));
      userHasVoted = userVote.length > 0;
    }

    // For non-anonymous polls, include voter information
    const optionsWithVoters = await Promise.all(
      options.map(async (option) => {
        if (!poll.isAnonymous) {
          const voters = await db
            .select({
              id: user.id,
              name: user.name,
              bitsId: user.bitsId,
            })
            .from(user)
            .innerJoin(pollVotes, eq(user.id, pollVotes.userId))
            .where(eq(pollVotes.optionId, option.id));

          return {
            ...option,
            voters,
          };
        }

        return {
          ...option,
          voters: [], // Empty for anonymous polls
        };
      })
    );

    const totalVotes = options.reduce((sum, opt) => sum + opt.voteCount, 0);

    return {
      poll,
      options: optionsWithVoters,
      totalVotes,
      userHasVoted,
    };
  }

  // ==================== TASK & SCHEDULE METHODS ====================

  /**
   * Create a task (with auto-schedule creation)
   */
  async createTask(data: {
    groupId: string;
    title: string;
    description?: string;
    assignedTo: string;
    assignedBy: string;
    dueDate?: Date;
    priority?: 'low' | 'medium' | 'high';
  }) {
    // Create task
    const task = await db
      .insert(tasks)
      .values({
        groupId: data.groupId,
        title: data.title,
        description: data.description,
        assignedTo: data.assignedTo,
        assignedBy: data.assignedBy,
        dueDate: data.dueDate,
        priority: data.priority || 'medium',
        status: 'pending',
      })
      .returning();

    // AUTO-CREATE schedule entry if due date exists
    let schedule = null;
    if (data.dueDate) {
      const scheduleResult = await db
        .insert(schedules)
        .values({
          userId: data.assignedTo,
          title: `Task: ${data.title}`,
          description: data.description,
          startTime: data.dueDate,
          eventType: 'task',
          sourceTaskId: task[0].id,
        })
        .returning();
      schedule = scheduleResult[0];
    }

    return {
      task: task[0],
      schedule,
    };
  }

  /**
   * Update a task (with schedule sync)
   */
  async updateTask(
    taskId: string,
    updates: {
      title?: string;
      description?: string;
      dueDate?: Date;
      priority?: 'low' | 'medium' | 'high';
      status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    }
  ) {
    // Update task
    const task = await db.update(tasks).set(updates).where(eq(tasks.id, taskId)).returning();

    // SYNC with schedule
    const scheduleData = await db.select().from(schedules).where(eq(schedules.sourceTaskId, taskId));

    if (scheduleData.length > 0) {
      const scheduleUpdates: any = {};

      if (updates.title) scheduleUpdates.title = `Task: ${updates.title}`;
      if (updates.description !== undefined) scheduleUpdates.description = updates.description;
      if (updates.dueDate) scheduleUpdates.startTime = updates.dueDate;

      // If task is completed or cancelled, optionally remove from schedule
      if (updates.status === 'completed' || updates.status === 'cancelled') {
        await db.delete(schedules).where(eq(schedules.sourceTaskId, taskId));
      } else if (Object.keys(scheduleUpdates).length > 0) {
        await db.update(schedules).set(scheduleUpdates).where(eq(schedules.sourceTaskId, taskId));
      }
    } else if (updates.dueDate) {
      // Create schedule if it doesn't exist but due date is being added
      await db.insert(schedules).values({
        userId: task[0].assignedTo,
        title: `Task: ${task[0].title}`,
        description: task[0].description,
        startTime: updates.dueDate,
        eventType: 'task',
        sourceTaskId: taskId,
      });
    }

    return task[0];
  }

  /**
   * Delete a task (cascades to schedule)
   */
  async deleteTask(taskId: string) {
    // Delete schedule first (if exists)
    await db.delete(schedules).where(eq(schedules.sourceTaskId, taskId));

    // Delete task
    await db.delete(tasks).where(eq(tasks.id, taskId));
  }

  /**
   * Get tasks for a group
   */
  async getGroupTasks(groupId: string, filters?: { assignedTo?: string; status?: string }) {
    let query = db
      .select({
        task: tasks,
        assignedToUser: {
          id: user.id,
          name: user.name,
          bitsId: user.bitsId,
        },
      })
      .from(tasks)
      .innerJoin(user, eq(tasks.assignedTo, user.id))
      .where(eq(tasks.groupId, groupId));

    const results = await query.orderBy(desc(tasks.createdAt));

    // Apply filters
    let filtered = results;
    if (filters?.assignedTo) {
      filtered = filtered.filter((r) => r.task.assignedTo === filters.assignedTo);
    }
    if (filters?.status) {
      filtered = filtered.filter((r) => r.task.status === filters.status);
    }

    return filtered;
  }

  /**
   * Get user's schedule
   */
  async getUserSchedule(userId: string, startDate?: Date, endDate?: Date) {
    let query = db
      .select({
        schedule: schedules,
        task: tasks,
      })
      .from(schedules)
      .leftJoin(tasks, eq(schedules.sourceTaskId, tasks.id))
      .where(eq(schedules.userId, userId));

    const results = await query.orderBy(schedules.startTime);

    // Filter by date range if provided
    let filtered = results;
    if (startDate) {
      filtered = filtered.filter((r) => r.schedule.startTime >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((r) => r.schedule.startTime <= endDate);
    }

    return filtered;
  }
}

// Export singleton instance
export const socialService = new SocialService();

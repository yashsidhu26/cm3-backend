import { pgTable, uuid, varchar, text, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { groups } from '../payments/payments.schema';
import { relations } from 'drizzle-orm';

/**
 * Social Module Schema
 * Tables for social features like posts, comments, RBAC, polls, tasks, etc.
 */

// Enums
export const postTypeEnum = pgEnum('post_type', ['regular', 'announcement', 'intro', 'poll']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'completed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export const scheduleEventTypeEnum = pgEnum('schedule_event_type', ['task', 'meeting', 'personal', 'other']);

// Posts table (Enhanced)
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  title: varchar('title', { length: 255 }),
  postType: postTypeEnum('post_type').notNull().default('regular'),
  isPinned: boolean('is_pinned').notNull().default(false),
  likesCount: integer('likes_count').notNull().default(0),
  commentsCount: integer('comments_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Comments table
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// RBAC: Positions table
export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// RBAC: Position Permissions table
export const positionPermissions = pgTable('position_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  positionId: uuid('position_id')
    .notNull()
    .references(() => positions.id, { onDelete: 'cascade' }),
  permissionKey: varchar('permission_key', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// RBAC: Group Membership (Enhanced - links to payments module)
export const groupMembership = pgTable('group_membership_social', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Announcements metadata table
export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .unique()
    .references(() => posts.id, { onDelete: 'cascade' }),
  meetingDate: timestamp('meeting_date'),
  meetingLocation: varchar('meeting_location', { length: 255 }),
  isUrgent: boolean('is_urgent').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Intro Posts metadata table
export const introPosts = pgTable('intro_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .unique()
    .references(() => posts.id, { onDelete: 'cascade' }),
  introducedUserId: uuid('introduced_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  addedByUserId: uuid('added_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Tags table
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 7 }),
  description: text('description'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// User Tags (junction table)
export const userTags = pgTable('user_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
});

// Polls table
export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .unique()
    .references(() => posts.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  isMultipleChoice: boolean('is_multiple_choice').notNull().default(false),
  endsAt: timestamp('ends_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Poll Options table
export const pollOptions = pgTable('poll_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id, { onDelete: 'cascade' }),
  optionText: varchar('option_text', { length: 255 }).notNull(),
  voteCount: integer('vote_count').notNull().default(0),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Poll Votes table (records who voted, and for non-anonymous polls, what they voted)
export const pollVotes = pgTable('poll_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').references(() => pollOptions.id, { onDelete: 'cascade' }), // NULL for anonymous
  votedAt: timestamp('voted_at').notNull().defaultNow(),
});

// Anonymous Poll Votes (separate table for privacy)
export const anonymousPollVotes = pgTable('anonymous_poll_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id')
    .notNull()
    .references(() => polls.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id')
    .notNull()
    .references(() => pollOptions.id, { onDelete: 'cascade' }),
  votedAt: timestamp('voted_at').notNull().defaultNow(),
});

// Tasks table
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  assignedTo: uuid('assigned_to')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  dueDate: timestamp('due_date'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  status: taskStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Schedules table
export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  eventType: scheduleEventTypeEnum('event_type').notNull().default('other'),
  sourceTaskId: uuid('source_task_id')
    .unique()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations
export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(user, {
    fields: [posts.userId],
    references: [user.id],
  }),
  group: one(groups, {
    fields: [posts.groupId],
    references: [groups.id],
  }),
  comments: many(comments),
  announcement: one(announcements),
  introPost: one(introPosts),
  poll: one(polls),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  user: one(user, {
    fields: [comments.userId],
    references: [user.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  group: one(groups, {
    fields: [positions.groupId],
    references: [groups.id],
  }),
  creator: one(user, {
    fields: [positions.createdBy],
    references: [user.id],
  }),
  permissions: many(positionPermissions),
  memberships: many(groupMembership),
}));

export const positionPermissionsRelations = relations(positionPermissions, ({ one }) => ({
  position: one(positions, {
    fields: [positionPermissions.positionId],
    references: [positions.id],
  }),
}));

export const groupMembershipRelations = relations(groupMembership, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembership.groupId],
    references: [groups.id],
  }),
  user: one(user, {
    fields: [groupMembership.userId],
    references: [user.id],
  }),
  position: one(positions, {
    fields: [groupMembership.positionId],
    references: [positions.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  post: one(posts, {
    fields: [announcements.postId],
    references: [posts.id],
  }),
}));

export const introPostsRelations = relations(introPosts, ({ one }) => ({
  post: one(posts, {
    fields: [introPosts.postId],
    references: [posts.id],
  }),
  introducedUser: one(user, {
    fields: [introPosts.introducedUserId],
    references: [user.id],
    relationName: 'introducedUser',
  }),
  addedByUser: one(user, {
    fields: [introPosts.addedByUserId],
    references: [user.id],
    relationName: 'addedByUser',
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  group: one(groups, {
    fields: [tags.groupId],
    references: [groups.id],
  }),
  creator: one(user, {
    fields: [tags.createdBy],
    references: [user.id],
  }),
  userTags: many(userTags),
}));

export const userTagsRelations = relations(userTags, ({ one }) => ({
  user: one(user, {
    fields: [userTags.userId],
    references: [user.id],
  }),
  tag: one(tags, {
    fields: [userTags.tagId],
    references: [tags.id],
  }),
  group: one(groups, {
    fields: [userTags.groupId],
    references: [groups.id],
  }),
  assigner: one(user, {
    fields: [userTags.assignedBy],
    references: [user.id],
    relationName: 'assigner',
  }),
}));

export const pollsRelations = relations(polls, ({ one, many }) => ({
  post: one(posts, {
    fields: [polls.postId],
    references: [posts.id],
  }),
  options: many(pollOptions),
  votes: many(pollVotes),
  anonymousVotes: many(anonymousPollVotes),
}));

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(polls, {
    fields: [pollOptions.pollId],
    references: [polls.id],
  }),
  votes: many(pollVotes),
  anonymousVotes: many(anonymousPollVotes),
}));

export const pollVotesRelations = relations(pollVotes, ({ one }) => ({
  poll: one(polls, {
    fields: [pollVotes.pollId],
    references: [polls.id],
  }),
  user: one(user, {
    fields: [pollVotes.userId],
    references: [user.id],
  }),
  option: one(pollOptions, {
    fields: [pollVotes.optionId],
    references: [pollOptions.id],
  }),
}));

export const anonymousPollVotesRelations = relations(anonymousPollVotes, ({ one }) => ({
  poll: one(polls, {
    fields: [anonymousPollVotes.pollId],
    references: [polls.id],
  }),
  option: one(pollOptions, {
    fields: [anonymousPollVotes.optionId],
    references: [pollOptions.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  group: one(groups, {
    fields: [tasks.groupId],
    references: [groups.id],
  }),
  assignedToUser: one(user, {
    fields: [tasks.assignedTo],
    references: [user.id],
    relationName: 'assignedToUser',
  }),
  assignedByUser: one(user, {
    fields: [tasks.assignedBy],
    references: [user.id],
    relationName: 'assignedByUser',
  }),
  schedule: one(schedules),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  user: one(user, {
    fields: [schedules.userId],
    references: [user.id],
  }),
  sourceTask: one(tasks, {
    fields: [schedules.sourceTaskId],
    references: [tasks.id],
  }),
}));

// Type exports
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type PositionPermission = typeof positionPermissions.$inferSelect;
export type NewPositionPermission = typeof positionPermissions.$inferInsert;
export type GroupMembership = typeof groupMembership.$inferSelect;
export type NewGroupMembership = typeof groupMembership.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type IntroPost = typeof introPosts.$inferSelect;
export type NewIntroPost = typeof introPosts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type UserTag = typeof userTags.$inferSelect;
export type NewUserTag = typeof userTags.$inferInsert;
export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollOption = typeof pollOptions.$inferSelect;
export type NewPollOption = typeof pollOptions.$inferInsert;
export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;
export type AnonymousPollVote = typeof anonymousPollVotes.$inferSelect;
export type NewAnonymousPollVote = typeof anonymousPollVotes.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

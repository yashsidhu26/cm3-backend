import { pgTable, uuid, varchar, text, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Skills & Interests Module Schema
 * Allows users to track skills they want to learn and interests they want to pursue
 */

// Enums
export const skillCategoryEnum = pgEnum('skill_category', [
  'programming',
  'design',
  'business',
  'languages',
  'personal',
  'academic',
  'creative',
  'technical',
  'other'
]);

export const difficultyLevelEnum = pgEnum('difficulty_level', [
  'beginner',
  'intermediate',
  'advanced',
  'expert'
]);

export const learningStatusEnum = pgEnum('learning_status', [
  'interested',
  'learning',
  'completed',
  'paused'
]);

export const resourceTypeEnum = pgEnum('resource_type', [
  'article',
  'video',
  'course',
  'book',
  'tutorial',
  'documentation',
  'project',
  'other'
]);

export const skillTaskStatusEnum = pgEnum('skill_task_status', [
  'pending',
  'in_progress',
  'completed',
  'skipped'
]);

export const skillTaskTypeEnum = pgEnum('skill_task_type', [
  'task',
  'subskill'
]);

/**
 * Skills & Interests Catalog
 * Master list of all available skills/interests
 */
export const skillsInterests = pgTable('skills_interests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  category: skillCategoryEnum('category').notNull(),
  description: text('description'),
  difficulty: difficultyLevelEnum('difficulty').default('beginner'),
  estimatedHours: integer('estimated_hours'), // Estimated time to learn
  tags: text('tags').array(), // Array of tags for search
  icon: varchar('icon', { length: 100 }), // Icon name or emoji
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * User Skills/Interests
 * Tracks which skills users are learning/interested in
 */
export const userSkillsInterests = pgTable('user_skills_interests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  skillInterestId: uuid('skill_interest_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  status: learningStatusEnum('status').notNull().default('interested'),
  progress: integer('progress').default(0), // 0-100 percentage
  notes: text('notes'), // Personal notes
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Skill Learning Resources
 * Resources for learning specific skills
 */
export const skillResources = pgTable('skill_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillInterestId: uuid('skill_interest_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .references(() => user.id, { onDelete: 'cascade' }), // Optional: user who added it
  title: varchar('title', { length: 500 }).notNull(),
  url: text('url'),
  type: resourceTypeEnum('type').notNull().default('other'),
  description: text('description'),
  difficulty: difficultyLevelEnum('difficulty'),
  estimatedHours: integer('estimated_hours'),
  isCompleted: integer('is_completed').default(0), // 0 or 1 (per user if userId set)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Skill Plans
 * AI-generated learning plans for a specific skill
 */
export const skillPlans = pgTable('skill_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  skillInterestId: uuid('skill_interest_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Skill Tasks
 * Subtasks or subskills within a learning plan
 */
export const skillTasks = pgTable('skill_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => skillPlans.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  skillInterestId: uuid('skill_interest_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  howTo: text('how_to'),
  taskType: skillTaskTypeEnum('task_type').notNull().default('task'),
  order: integer('order').notNull().default(0),
  estimatedMinutes: integer('estimated_minutes'),
  status: skillTaskStatusEnum('status').notNull().default('pending'),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  scheduleItemId: uuid('schedule_item_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Skill Relationships
 * Links between skills (prerequisites, related skills, etc.)
 */
export const skillRelationshipTypeEnum = pgEnum('skill_relationship_type', [
  'prerequisite',
  'related',
  'builds_on',
  'alternative'
]);

export const skillRelationships = pgTable('skill_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromSkillId: uuid('from_skill_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  toSkillId: uuid('to_skill_id')
    .notNull()
    .references(() => skillsInterests.id, { onDelete: 'cascade' }),
  relationshipType: skillRelationshipTypeEnum('relationship_type').notNull().default('related'),
  description: text('description'), // Optional: describe why they're related
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Relations
 */
export const skillsInterestsRelations = relations(skillsInterests, ({ many }) => ({
  userSkills: many(userSkillsInterests),
  resources: many(skillResources),
  relatedFrom: many(skillRelationships, { relationName: 'fromSkill' }),
  relatedTo: many(skillRelationships, { relationName: 'toSkill' }),
  plans: many(skillPlans),
  tasks: many(skillTasks),
}));

export const skillPlansRelations = relations(skillPlans, ({ one, many }) => ({
  user: one(user, {
    fields: [skillPlans.userId],
    references: [user.id],
  }),
  skill: one(skillsInterests, {
    fields: [skillPlans.skillInterestId],
    references: [skillsInterests.id],
  }),
  tasks: many(skillTasks),
}));

export const skillTasksRelations = relations(skillTasks, ({ one }) => ({
  plan: one(skillPlans, {
    fields: [skillTasks.planId],
    references: [skillPlans.id],
  }),
  user: one(user, {
    fields: [skillTasks.userId],
    references: [user.id],
  }),
  skill: one(skillsInterests, {
    fields: [skillTasks.skillInterestId],
    references: [skillsInterests.id],
  }),
}));

export const userSkillsInterestsRelations = relations(userSkillsInterests, ({ one }) => ({
  user: one(user, {
    fields: [userSkillsInterests.userId],
    references: [user.id],
  }),
  skillInterest: one(skillsInterests, {
    fields: [userSkillsInterests.skillInterestId],
    references: [skillsInterests.id],
  }),
}));

export const skillResourcesRelations = relations(skillResources, ({ one }) => ({
  skillInterest: one(skillsInterests, {
    fields: [skillResources.skillInterestId],
    references: [skillsInterests.id],
  }),
  user: one(user, {
    fields: [skillResources.userId],
    references: [user.id],
  }),
}));

export const skillRelationshipsRelations = relations(skillRelationships, ({ one }) => ({
  fromSkill: one(skillsInterests, {
    fields: [skillRelationships.fromSkillId],
    references: [skillsInterests.id],
    relationName: 'fromSkill',
  }),
  toSkill: one(skillsInterests, {
    fields: [skillRelationships.toSkillId],
    references: [skillsInterests.id],
    relationName: 'toSkill',
  }),
}));

/**
 * Type exports
 */
export type SkillInterest = typeof skillsInterests.$inferSelect;
export type NewSkillInterest = typeof skillsInterests.$inferInsert;
export type UserSkillInterest = typeof userSkillsInterests.$inferSelect;
export type NewUserSkillInterest = typeof userSkillsInterests.$inferInsert;
export type SkillResource = typeof skillResources.$inferSelect;
export type NewSkillResource = typeof skillResources.$inferInsert;

export type SkillPlan = typeof skillPlans.$inferSelect;
export type NewSkillPlan = typeof skillPlans.$inferInsert;
export type SkillTask = typeof skillTasks.$inferSelect;
export type NewSkillTask = typeof skillTasks.$inferInsert;
export type SkillRelationship = typeof skillRelationships.$inferSelect;
export type NewSkillRelationship = typeof skillRelationships.$inferInsert;

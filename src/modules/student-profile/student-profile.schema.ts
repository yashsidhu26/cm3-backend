import { pgTable, uuid, varchar, text, timestamp, jsonb, decimal, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Student Profile Module Schema
 * Stores comprehensive student data for AI analysis
 */

// Enums
export const learningStyleEnum = pgEnum('learning_style', ['visual', 'auditory', 'kinesthetic', 'hybrid']);
export const commitmentTypeEnum = pgEnum('commitment_type', ['academic', 'extracurricular', 'personal', 'work']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export const taskStatusEnum = pgEnum('task_status', ['completed', 'pending', 'cancelled']);

/**
 * Student Profiles - Extends User
 */
export const studentProfiles = pgTable('student_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .unique()
        .references(() => user.id, { onDelete: 'cascade' }),
    learningStyle: learningStyleEnum('learning_style').default('hybrid'),
    bio: text('bio'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Student Academics - Analysis Data
 */
export const studentAcademics = pgTable('student_academics', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .unique() // One academic profile per user specific to this module
        .references(() => user.id, { onDelete: 'cascade' }),
    gpa: decimal('gpa', { precision: 3, scale: 2 }),
    major: varchar('major', { length: 255 }),
    skills: jsonb('skills').$type<string[]>(), // e.g. ["Python", "JavaScript"]
    interests: jsonb('interests').$type<string[]>(), // e.g. ["Robotics", "AI"]
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Student Experiences
 */
export const studentExperiences = pgTable('student_experiences', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    role: varchar('role', { length: 255 }), // e.g. "Software Intern"
    organization: varchar('organization', { length: 255 }),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    description: text('description'),
    skillsUsed: jsonb('skills_used').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Student Commitments
 */
export const studentCommitments = pgTable('student_commitments', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    date: timestamp('date').notNull(),
    description: text('description'),
    type: commitmentTypeEnum('type').default('personal'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Activity Logs - For Behavioral Analysis
 */
export const activityLogs = pgTable('activity_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id'), // Can be linked to an external task system or standalone
    scheduledTime: timestamp('scheduled_time'),
    completionTime: timestamp('completion_time'),
    priority: taskPriorityEnum('priority').default('medium'),
    status: taskStatusEnum('status').default('completed'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Relations
 */
export const studentProfilesRelations = relations(studentProfiles, ({ one }) => ({
    user: one(user, {
        fields: [studentProfiles.userId],
        references: [user.id],
    }),
}));

export const studentAcademicsRelations = relations(studentAcademics, ({ one }) => ({
    user: one(user, {
        fields: [studentAcademics.userId],
        references: [user.id],
    }),
}));

export const studentExperiencesRelations = relations(studentExperiences, ({ one }) => ({
    user: one(user, {
        fields: [studentExperiences.userId],
        references: [user.id],
    }),
}));

export const studentCommitmentsRelations = relations(studentCommitments, ({ one }) => ({
    user: one(user, {
        fields: [studentCommitments.userId],
        references: [user.id],
    }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
    user: one(user, {
        fields: [activityLogs.userId],
        references: [user.id],
    }),
}));

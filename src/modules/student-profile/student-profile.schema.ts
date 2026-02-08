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
export const assignmentStatusEnum = pgEnum('assignment_status', ['not_started', 'in_progress', 'submitted', 'graded']);
export const evaluationTypeEnum = pgEnum('evaluation_type', ['quiz', 'exam', 'report', 'presentation', 'project']);
export const syncSourceEnum = pgEnum('sync_source', ['moodle', 'gmail']);

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
 * Student Assignments
 */
export const studentAssignments = pgTable('student_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id'), // Link to enrolled course
    courseCode: varchar('course_code', { length: 50 }), // e.g. "CS F111"
    courseName: varchar('course_name', { length: 255 }), // e.g. "Data Structures"
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    dueDate: timestamp('due_date').notNull(),
    priority: taskPriorityEnum('priority').default('medium'),
    status: assignmentStatusEnum('status').default('not_started'),
    moodleAssignmentId: varchar('moodle_assignment_id', { length: 100 }), // Link to Moodle
    notificationId: varchar('notification_id', { length: 100 }), // Link to Moodle notification
    sourceType: varchar('source_type', { length: 50 }), // 'moodle', 'gmail', 'manual'
    sourceId: varchar('source_id', { length: 255 }), // Email ID or notification ID
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Student Evaluations (Quizzes, Exams, etc.)
 */
export const studentEvaluations = pgTable('student_evaluations', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id'), // Link to enrolled course
    courseCode: varchar('course_code', { length: 50 }), // e.g. "MATH F112"
    courseName: varchar('course_name', { length: 255 }), // e.g. "Linear Algebra"
    title: varchar('title', { length: 255 }).notNull(),
    type: evaluationTypeEnum('type').notNull(),
    date: timestamp('date').notNull(),
    duration: varchar('duration', { length: 50 }), // e.g. "90 minutes"
    location: varchar('location', { length: 255 }), // e.g. "Room 2205"
    description: text('description'),
    moodleEventId: varchar('moodle_event_id', { length: 100 }), // Link to Moodle
    notificationId: varchar('notification_id', { length: 100 }), // Link to Moodle notification
    sourceType: varchar('source_type', { length: 50 }), // 'moodle', 'gmail', 'manual'
    sourceId: varchar('source_id', { length: 255 }), // Email ID or notification ID
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const studentAssignmentsRelations = relations(studentAssignments, ({ one }) => ({
    user: one(user, {
        fields: [studentAssignments.userId],
        references: [user.id],
    }),
}));

export const studentEvaluationsRelations = relations(studentEvaluations, ({ one }) => ({
    user: one(user, {
        fields: [studentEvaluations.userId],
        references: [user.id],
    }),
}));

/**
 * Sync State table
 * Tracks last synced position for Moodle notifications and Gmail emails
 * Prevents reprocessing the same data
 */
export const syncState = pgTable('sync_state', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    source: syncSourceEnum('source').notNull(), // 'moodle' or 'gmail'

    // For Moodle: last notification ID processed
    lastNotificationId: varchar('last_notification_id', { length: 100 }),

    // For Gmail: last email internal date (milliseconds since epoch)
    lastEmailTimestamp: varchar('last_email_timestamp', { length: 50 }),

    // For Gmail: last history ID for incremental sync
    lastHistoryId: varchar('last_history_id', { length: 100 }),

    lastSyncAt: timestamp('last_sync_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const syncStateRelations = relations(syncState, ({ one }) => ({
    user: one(user, {
        fields: [syncState.userId],
        references: [user.id],
    }),
}));

// Type exports
export type StudentProfile = typeof studentProfiles.$inferSelect;
export type NewStudentProfile = typeof studentProfiles.$inferInsert;
export type StudentAcademic = typeof studentAcademics.$inferSelect;
export type NewStudentAcademic = typeof studentAcademics.$inferInsert;
export type StudentExperience = typeof studentExperiences.$inferSelect;
export type NewStudentExperience = typeof studentExperiences.$inferInsert;
export type StudentCommitment = typeof studentCommitments.$inferSelect;
export type NewStudentCommitment = typeof studentCommitments.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type StudentAssignment = typeof studentAssignments.$inferSelect;
export type NewStudentAssignment = typeof studentAssignments.$inferInsert;
export type StudentEvaluation = typeof studentEvaluations.$inferSelect;
export type NewStudentEvaluation = typeof studentEvaluations.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
export type NewSyncState = typeof syncState.$inferInsert;

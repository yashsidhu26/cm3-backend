import { pgTable, uuid, varchar, timestamp, text, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Academics Module Schema
 * Stores courses, enrollments, and learning resources
 */

// Resource type enum
export const resourceTypeEnum = pgEnum('resource_type', ['pdf', 'slide', 'video', 'link', 'assignment', 'other']);

// Semester enum
export const semesterEnum = pgEnum('semester', ['fall', 'spring', 'summer']);

/**
 * Courses table
 * Stores course information synced from Moodle
 */
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  moodleCourseId: varchar('moodle_course_id', { length: 100 }).unique(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  professorName: varchar('professor_name', { length: 255 }),
  description: text('description'),
  semester: semesterEnum('semester'),
  year: varchar('year', { length: 10 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Enrollments table
 * Many-to-Many relationship between users and courses
 */
export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  semester: semesterEnum('semester').notNull().default('fall'),
  year: varchar('year', { length: 10 }),
  enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
});

/**
 * Resources table
 * Stores course materials (PDFs, slides, videos, etc.)
 */
export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  url: text('url').notNull(),
  type: resourceTypeEnum('type').notNull().default('other'),
  isDownloaded: boolean('is_downloaded').notNull().default(false),
  fileSize: varchar('file_size', { length: 50 }),
  moodleResourceId: varchar('moodle_resource_id', { length: 100 }),
  uploadedBy: varchar('uploaded_by', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Relations for Drizzle ORM
 * Enables type-safe relational queries
 */

// Course relations
export const coursesRelations = relations(courses, ({ many }) => ({
  enrollments: many(enrollments),
  resources: many(resources),
}));

// Enrollment relations
export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(user, {
    fields: [enrollments.userId],
    references: [user.id],
  }),
  course: one(courses, {
    fields: [enrollments.courseId],
    references: [courses.id],
  }),
}));

// Resource relations
export const resourcesRelations = relations(resources, ({ one }) => ({
  course: one(courses, {
    fields: [resources.courseId],
    references: [courses.id],
  }),
}));

/**
 * Type exports for TypeScript type safety
 */
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;

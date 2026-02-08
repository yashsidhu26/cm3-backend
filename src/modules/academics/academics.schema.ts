import { pgTable, uuid, varchar, timestamp, text, boolean, pgEnum, integer } from 'drizzle-orm/pg-core';
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
 * Stores course information synced from Moodle and BITS course catalog
 */
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Moodle integration
  moodleCourseId: varchar('moodle_course_id', { length: 100 }).unique(),

  // BITS course catalog integration (from all_courses.json)
  staticId: varchar('static_id', { length: 100 }).unique(), // UUID from all_courses.json

  // Core course info
  code: varchar('code', { length: 50 }).notNull(), // e.g., "BIO F101"
  name: varchar('name', { length: 255 }).notNull(),
  professorName: varchar('professor_name', { length: 255 }),
  description: text('description'),

  // Academic details
  units: integer('units'), // Credit units
  courseType: varchar('course_type', { length: 50 }), // e.g., "OPEL", "CDC", "Elective"
  nickname: varchar('nickname', { length: 255 }), // Optional nickname

  // Course materials
  handoutLink: text('handout_link'), // PDF link from handouts.json

  // Metadata
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
 * Course Sections table
 * Stores section details (lecture, tutorial, lab) with instructors and rooms
 */
export const courseSections = pgTable('course_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  sectionType: varchar('section_type', { length: 50 }).notNull(), // Lecture, Tutorial, Lab
  sectionNumber: integer('section_number').notNull(),
  instructors: text('instructors').array(), // Array of instructor names
  roomNumber: varchar('room_number', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Class Schedule table
 * Stores individual class timings for each section
 */
export const classSchedule = pgTable('class_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => courseSections.id, { onDelete: 'cascade' }),
  dayOfWeek: varchar('day_of_week', { length: 20 }).notNull(), // Monday, Tuesday, etc.
  startTime: varchar('start_time', { length: 10 }).notNull(), // HH:MM format
  endTime: varchar('end_time', { length: 10 }).notNull(), // HH:MM format
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * User Section Registration table
 * Tracks which sections each user is registered for
 */
export const userSectionRegistrations = pgTable('user_section_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => courseSections.id, { onDelete: 'cascade' }),
  registeredAt: timestamp('registered_at').notNull().defaultNow(),
});

/**
 * Relations for Drizzle ORM
 * Enables type-safe relational queries
 */

// Course relations
export const coursesRelations = relations(courses, ({ many }) => ({
  enrollments: many(enrollments),
  resources: many(resources),
  sections: many(courseSections),
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

// Course Section relations
export const courseSectionsRelations = relations(courseSections, ({ one, many }) => ({
  course: one(courses, {
    fields: [courseSections.courseId],
    references: [courses.id],
  }),
  schedule: many(classSchedule),
  registrations: many(userSectionRegistrations),
}));

// Class Schedule relations
export const classScheduleRelations = relations(classSchedule, ({ one }) => ({
  section: one(courseSections, {
    fields: [classSchedule.sectionId],
    references: [courseSections.id],
  }),
}));

// User Section Registration relations
export const userSectionRegistrationsRelations = relations(userSectionRegistrations, ({ one }) => ({
  user: one(user, {
    fields: [userSectionRegistrations.userId],
    references: [user.id],
  }),
  section: one(courseSections, {
    fields: [userSectionRegistrations.sectionId],
    references: [courseSections.id],
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

export type CourseSection = typeof courseSections.$inferSelect;
export type NewCourseSection = typeof courseSections.$inferInsert;

export type ClassSchedule = typeof classSchedule.$inferSelect;
export type NewClassSchedule = typeof classSchedule.$inferInsert;

export type UserSectionRegistration = typeof userSectionRegistrations.$inferSelect;
export type NewUserSectionRegistration = typeof userSectionRegistrations.$inferInsert;

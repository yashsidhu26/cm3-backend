/**
 * StudyDeck Module - Schema Definitions
 * Validation schemas for StudyDeck API requests
 * Note: Database table is defined in academics/studydeck-auth.schema.ts
 */

import { z } from 'zod';

// Re-export the existing StudyDeck token table from academics module
export { studyDeckToken as studydeckTokens } from '../academics/studydeck-auth.schema';

// Validation schemas
export const studydeckTokenSchema = z.object({
  jwtToken: z.string().min(1, 'JWT token is required'),
});

export const courseIdSchema = z.object({
  courseStaticId: z.string().uuid('Invalid course static ID'),
});

export const folderIdSchema = z.object({
  folderStaticId: z.string().uuid('Invalid folder static ID'),
});

export const searchResourcesSchema = z.object({
  courseCode: z.string().min(1, 'Course code is required'),
  resourceType: z.enum(['slides', 'papers', 'notes', 'all']).optional().default('all'),
  limit: z.number().min(1).max(50).optional().default(20),
});

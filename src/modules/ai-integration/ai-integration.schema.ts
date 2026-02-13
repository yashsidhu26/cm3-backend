import { pgTable, uuid, varchar, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { z } from 'zod';

/**
 * AI Conversations Table
 * Stores conversation history between users and AI
 */
export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  source: varchar('source', { length: 20 }), // 'groq' | 'gemini' | null
  metadata: jsonb('metadata').$type<{
    complexity?: string;
    contextUsed?: string[];
    // Agent-specific fields
    toolsUsed?: string[];
    iterations?: number;
    totalToolCalls?: number;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * AI Usage Statistics Table
 * Tracks daily AI usage per user for cost monitoring
 */
export const aiUsageStats = pgTable('ai_usage_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull().defaultNow(),
  groqRequests: integer('groq_requests').notNull().default(0),
  geminiRequests: integer('gemini_requests').notNull().default(0),
  totalTokensUsed: integer('total_tokens_used').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Zod Validation Schemas
 */

export const chatRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(2000, 'Query too long'),
  includeHistory: z.boolean().optional().default(true),
  format: z.enum(['text', 'json', 'schedule', 'overview']).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const clearHistorySchema = z.object({
  confirm: z.boolean().optional(),
});

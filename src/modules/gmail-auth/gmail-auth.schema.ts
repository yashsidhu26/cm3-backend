import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../../core/database/schema';

/**
 * Gmail Auth Module Schema
 * Stores encrypted OAuth tokens for Gmail API access
 */

/**
 * Gmail Token table
 * Stores encrypted OAuth tokens per user for Gmail API access
 * One-to-one relationship with user table
 */
export const gmailToken = pgTable('gmail_token', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .unique()
        .references(() => user.id, { onDelete: 'cascade' }),

    // Encrypted tokens (AES-256-GCM)
    encryptedAccessToken: text('encrypted_access_token'),
    encryptedRefreshToken: text('encrypted_refresh_token'),

    // Token metadata
    tokenExpiry: timestamp('token_expiry'),
    scope: text('scope'),
    email: text('email'), // Gmail email address

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Type exports for type safety
export type GmailToken = typeof gmailToken.$inferSelect;
export type NewGmailToken = typeof gmailToken.$inferInsert;

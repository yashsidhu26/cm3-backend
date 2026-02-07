import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../../modules/auth/auth.schema';

/**
 * StudyDeck Token Storage
 * Stores encrypted JWT tokens for StudyDeck API access
 */
export const studyDeckToken = pgTable('studydeck_token', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  encryptedToken: text('encrypted_token').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

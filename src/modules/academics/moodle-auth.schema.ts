
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../../modules/auth/auth.schema';

export const moodleToken = pgTable('moodle_token', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    encryptedToken: text('encrypted_token').notNull(),
    moodleUserId: text('moodle_user_id'),
    moodleUsername: text('moodle_username'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

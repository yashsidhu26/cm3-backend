import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, decimal } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Payments Module Schema
 * Splitwise-like expense sharing and settlement tracking
 */

// Split type enum - how to divide expenses
export const splitTypeEnum = pgEnum('split_type', ['equal', 'exact', 'percentage']);

// Expense category enum
export const expenseCategoryEnum = pgEnum('expense_category', [
    'food',
    'transport',
    'accommodation',
    'entertainment',
    'utilities',
    'other',
]);

export const groupTypeEnum = pgEnum('group_type', ['clubs', 'depts', 'friends']);
export const friendRequestStatusEnum = pgEnum('friend_request_status', ['pending', 'accepted', 'rejected']);

/**
 * Groups table
 * Containers for shared expenses (e.g., "Roommates", "Trip to Goa")
 */
export const groups = pgTable('groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: groupTypeEnum('type').notNull().default('friends'),
    inviteToken: varchar('invite_token', { length: 128 }).unique(),
    createdBy: uuid('created_by')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const paymentFriends = pgTable('payment_friends', {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    status: friendRequestStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const directExpenses = pgTable('direct_expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    description: varchar('description', { length: 500 }).notNull(),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    payerId: uuid('payer_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    date: timestamp('date').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const directExpenseSplits = pgTable('direct_expense_splits', {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
        .notNull()
        .references(() => directExpenses.id, { onDelete: 'cascade' }),
    owedByUserId: uuid('owed_by_user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    owedToUserId: uuid('owed_to_user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    shareAmount: decimal('share_amount', { precision: 12, scale: 2 }).notNull(),
    isSettled: boolean('is_settled').notNull().default(false),
    settledAt: timestamp('settled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Group Members table
 * Many-to-Many relationship between users and groups
 */
export const groupMembers = pgTable('group_members', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
        .notNull()
        .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

/**
 * Expenses table
 * Individual expenses within groups
 */
export const expenses = pgTable('expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
        .notNull()
        .references(() => groups.id, { onDelete: 'cascade' }),
    description: varchar('description', { length: 500 }).notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidBy: uuid('paid_by')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    splitType: splitTypeEnum('split_type').notNull().default('equal'),
    category: expenseCategoryEnum('category').notNull().default('other'),
    date: timestamp('date').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Expense Participants table
 * Tracks who owes what for each expense
 */
export const expenseParticipants = pgTable('expense_participants', {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
        .notNull()
        .references(() => expenses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    shareAmount: decimal('share_amount', { precision: 12, scale: 2 }).notNull(),
    isPaid: boolean('is_paid').notNull().default(false),
});

/**
 * Settlements table
 * Tracks payments between users to settle debts
 */
export const settlements = pgTable('settlements', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
        .notNull()
        .references(() => groups.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    note: text('note'),
    settledAt: timestamp('settled_at').notNull().defaultNow(),
});

/**
 * Relations for Drizzle ORM
 * Enables type-safe relational queries
 */

// Group relations
export const groupsRelations = relations(groups, ({ one, many }) => ({
    creator: one(user, {
        fields: [groups.createdBy],
        references: [user.id],
    }),
    members: many(groupMembers),
    expenses: many(expenses),
    settlements: many(settlements),
}));

// Group Members relations
export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
    group: one(groups, {
        fields: [groupMembers.groupId],
        references: [groups.id],
    }),
    user: one(user, {
        fields: [groupMembers.userId],
        references: [user.id],
    }),
}));

// Expense relations
export const expensesRelations = relations(expenses, ({ one, many }) => ({
    group: one(groups, {
        fields: [expenses.groupId],
        references: [groups.id],
    }),
    payer: one(user, {
        fields: [expenses.paidBy],
        references: [user.id],
    }),
    participants: many(expenseParticipants),
}));

// Expense Participants relations
export const expenseParticipantsRelations = relations(expenseParticipants, ({ one }) => ({
    expense: one(expenses, {
        fields: [expenseParticipants.expenseId],
        references: [expenses.id],
    }),
    user: one(user, {
        fields: [expenseParticipants.userId],
        references: [user.id],
    }),
}));

// Settlement relations
export const settlementsRelations = relations(settlements, ({ one }) => ({
    group: one(groups, {
        fields: [settlements.groupId],
        references: [groups.id],
    }),
    fromUser: one(user, {
        fields: [settlements.fromUserId],
        references: [user.id],
        relationName: 'settlementsFrom',
    }),
    toUser: one(user, {
        fields: [settlements.toUserId],
        references: [user.id],
        relationName: 'settlementsTo',
    }),
}));

/**
 * Type exports for TypeScript type safety
 */
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type ExpenseParticipant = typeof expenseParticipants.$inferSelect;
export type NewExpenseParticipant = typeof expenseParticipants.$inferInsert;

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;

export type PaymentFriend = typeof paymentFriends.$inferSelect;
export type NewPaymentFriend = typeof paymentFriends.$inferInsert;

export type DirectExpense = typeof directExpenses.$inferSelect;
export type NewDirectExpense = typeof directExpenses.$inferInsert;

export type DirectExpenseSplit = typeof directExpenseSplits.$inferSelect;
export type NewDirectExpenseSplit = typeof directExpenseSplits.$inferInsert;

import { pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Marketplace Module Schema
 * Privacy-first campus marketplace for buying, selling, and bartering
 */

// Listing type enum - commerce modes
export const listingTypeEnum = pgEnum('listing_type', ['sale', 'trade', 'both']);

// Item status enum
export const itemStatusEnum = pgEnum('item_status', ['active', 'reserved', 'sold']);

// Item category enum
export const itemCategoryEnum = pgEnum('item_category', [
    'electronics',
    'books',
    'dorm_essentials',
    'lab_gear',
    'clothing',
    'sports',
    'other',
]);

// Item condition enum
export const itemConditionEnum = pgEnum('item_condition', [
    'new',
    'like_new',
    'good',
    'fair',
    'poor',
]);

// Conversation stage enum - handshake protocol states
export const conversationStageEnum = pgEnum('conversation_stage', [
    'negotiation',
    'seller_revealed',
    'finalized',
]);

/**
 * Items table
 * Marketplace listings with privacy controls
 */
export const items = pgTable('marketplace_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    price: decimal('price', { precision: 12, scale: 2 }), // Nullable for trade-only items
    tradeWishlist: text('trade_wishlist'), // What seller wants in trade
    listingType: listingTypeEnum('listing_type').notNull().default('sale'),
    category: itemCategoryEnum('category').notNull().default('other'),
    condition: itemConditionEnum('condition').notNull().default('good'),
    hostelZone: varchar('hostel_zone', { length: 100 }), // For proximity filtering
    status: itemStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Item Images table
 * Multiple images per listing
 */
export const itemImages = pgTable('marketplace_item_images', {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
        .notNull()
        .references(() => items.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Conversations table
 * Private negotiation channels scoped to specific items
 * Implements the "Handshake Protocol" state machine
 */
export const conversations = pgTable('marketplace_conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
        .notNull()
        .references(() => items.id, { onDelete: 'cascade' }),
    buyerId: uuid('buyer_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    sellerId: uuid('seller_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    stage: conversationStageEnum('stage').notNull().default('negotiation'),
    sellerRevealed: boolean('seller_revealed').notNull().default(false),
    dealFinalized: boolean('deal_finalized').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Messages table
 * Chat messages within conversations
 */
export const messages = pgTable('marketplace_messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
        .notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isSystemMessage: boolean('is_system_message').notNull().default(false),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
});

/**
 * Reviews table
 * Post-transaction trust ratings
 */
export const reviews = pgTable('marketplace_reviews', {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewerId: uuid('reviewer_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
        .notNull()
        .references(() => items.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1-5 stars
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Relations for Drizzle ORM
 * Enables type-safe relational queries
 */

// Item relations
export const itemsRelations = relations(items, ({ one, many }) => ({
    seller: one(user, {
        fields: [items.sellerId],
        references: [user.id],
    }),
    images: many(itemImages),
    conversations: many(conversations),
    reviews: many(reviews),
}));

// Item Images relations
export const itemImagesRelations = relations(itemImages, ({ one }) => ({
    item: one(items, {
        fields: [itemImages.itemId],
        references: [items.id],
    }),
}));

// Conversation relations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
    item: one(items, {
        fields: [conversations.itemId],
        references: [items.id],
    }),
    buyer: one(user, {
        fields: [conversations.buyerId],
        references: [user.id],
        relationName: 'conversationsAsBuyer',
    }),
    seller: one(user, {
        fields: [conversations.sellerId],
        references: [user.id],
        relationName: 'conversationsAsSeller',
    }),
    messages: many(messages),
}));

// Message relations
export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
        fields: [messages.conversationId],
        references: [conversations.id],
    }),
    sender: one(user, {
        fields: [messages.senderId],
        references: [user.id],
    }),
}));

// Review relations
export const reviewsRelations = relations(reviews, ({ one }) => ({
    reviewer: one(user, {
        fields: [reviews.reviewerId],
        references: [user.id],
        relationName: 'reviewsGiven',
    }),
    targetUser: one(user, {
        fields: [reviews.targetUserId],
        references: [user.id],
        relationName: 'reviewsReceived',
    }),
    item: one(items, {
        fields: [reviews.itemId],
        references: [items.id],
    }),
}));

/**
 * Type exports for TypeScript type safety
 */
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type ItemImage = typeof itemImages.$inferSelect;
export type NewItemImage = typeof itemImages.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

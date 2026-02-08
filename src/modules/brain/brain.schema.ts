import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';
import { relations } from 'drizzle-orm';

/**
 * Brain Module Schema
 * Stores interconnected network graph data representing user interests
 */

// Node type enum
export const brainNodeTypeEnum = pgEnum('brain_node_type', ['core', 'niche', 'suggestion']);

// Source type enum
export const brainSourceTypeEnum = pgEnum('brain_source_type', ['youtube', 'drive', 'pinterest', 'goodreads', 'link']);

/**
 * Brain Nodes Table
 * Represents an interest or concept in the network
 */
export const brainNodes = pgTable('brain_nodes', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: brainNodeTypeEnum('type').notNull().default('niche'),
    val: integer('val').notNull().default(10), // Size/Weight of the node
    metadata: jsonb('metadata').$type<{
        summary?: string;
        allied?: string[];
    }>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Brain Links Table
 * Represents connections between interest nodes
 */
export const brainLinks = pgTable('brain_links', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
        .notNull()
        .references(() => brainNodes.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
        .notNull()
        .references(() => brainNodes.id, { onDelete: 'cascade' }),
    dashed: boolean('dashed').notNull().default(false), // Visual distinction for suggestion paths
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Brain Sources Table
 * Stores associated media/files for each node
 */
export const brainSources = pgTable('brain_sources', {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
        .notNull()
        .references(() => brainNodes.id, { onDelete: 'cascade' }),
    type: brainSourceTypeEnum('type').notNull().default('link'),
    title: varchar('title', { length: 500 }).notNull(),
    url: text('url'),
    date: varchar('date', { length: 100 }), // Human readable date/status like "Added yesterday"
    metadata: jsonb('metadata').$type<{
        viewCount?: string;
        description?: string;
        icon?: string;
        summary?: string;
        questions?: string[];
    }>(),
    vector: jsonb('vector').$type<number[]>(), // AI-generated embedding
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Relations for Drizzle ORM
 */

export const brainNodesRelations = relations(brainNodes, ({ one, many }) => ({
    user: one(user, {
        fields: [brainNodes.userId],
        references: [user.id],
    }),
    sources: many(brainSources),
    outgoingLinks: many(brainLinks, { relationName: 'outgoing' }),
    incomingLinks: many(brainLinks, { relationName: 'incoming' }),
}));

export const brainLinksRelations = relations(brainLinks, ({ one }) => ({
    user: one(user, {
        fields: [brainLinks.userId],
        references: [user.id],
    }),
    source: one(brainNodes, {
        fields: [brainLinks.sourceId],
        references: [brainNodes.id],
        relationName: 'outgoing',
    }),
    target: one(brainNodes, {
        fields: [brainLinks.targetId],
        references: [brainNodes.id],
        relationName: 'incoming',
    }),
}));

export const brainSourcesRelations = relations(brainSources, ({ one }) => ({
    node: one(brainNodes, {
        fields: [brainSources.nodeId],
        references: [brainNodes.id],
    }),
}));

// Type exports
export type BrainNode = typeof brainNodes.$inferSelect;
export type NewBrainNode = typeof brainNodes.$inferInsert;
export type BrainLink = typeof brainLinks.$inferSelect;
export type NewBrainLink = typeof brainLinks.$inferInsert;
export type BrainSource = typeof brainSources.$inferSelect;
export type NewBrainSource = typeof brainSources.$inferInsert;

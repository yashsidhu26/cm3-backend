import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'crypto';

/**
 * Spotify Module Schema (SQLite)
 * Features: Heat Map, Collaborative Voting, Whisper Gallery, Milestones
 */

export const users = sqliteTable('spotify_users', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    spotifyId: text('spotify_id').notNull().unique(),
    name: text('name').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: integer('expires_at'),
    createdAt: integer('created_at').default(Date.now()),
});

export const capsules = sqliteTable('spotify_capsules', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull().default(Date.now()),
    isFlashActive: integer('is_flash_active', { mode: 'boolean' }).default(false),
    flashSongId: text('flash_song_id'), // Selected song for the 90-day flash
});

export const queuedSongs = sqliteTable('queued_songs', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    capsuleId: text('capsule_id').references(() => capsules.id),
    spotifyTrackId: text('spotify_track_id').notNull(),
    status: text('status', { enum: ['pending', 'voted_true', 'voted_false'] }).default('pending'),
    createdAt: integer('created_at').default(Date.now()),
});

export const capsuleSongs = sqliteTable('capsule_songs', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    capsuleId: text('capsule_id').references(() => capsules.id),
    spotifyTrackId: text('spotify_track_id').notNull(),
    addedAt: integer('added_at').default(Date.now()),
});

export const whisperNotes = sqliteTable('whisper_notes', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    capsuleId: text('capsule_id').references(() => capsules.id),
    audioBlobUrl: text('audio_blob_url'), // In a real app, this would be a path/S3 URL
    trackId: text('track_id'), // Spotify track metadata tagged
    trackName: text('track_name'),
    artistName: text('artist_name'),
    createdAt: integer('created_at').default(Date.now()),
});

export const superSyncEvents = sqliteTable('super_sync_events', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    artistId: text('artist_id').notNull(),
    user1Id: text('user1_id').notNull(),
    user2Id: text('user2_id').notNull(),
    timestamp: integer('timestamp').notNull().default(Date.now()),
});

export const votes = sqliteTable('votes', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    queuedSongId: text('queued_song_id').notNull().references(() => queuedSongs.id),
    userId: text('user_id').notNull(),
    vote: integer('vote', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at').default(Date.now()),
});

export const flashReactions = sqliteTable('flash_reactions', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    capsuleId: text('capsule_id').notNull().references(() => capsules.id),
    userId: text('user_id').notNull(),
    reaction: text('reaction').notNull(),
    createdAt: integer('created_at').default(Date.now()),
});

// Type exports
export type User = typeof users.$inferSelect;
export type Capsule = typeof capsules.$inferSelect;
export type QueuedSong = typeof queuedSongs.$inferSelect;
export type CapsuleSong = typeof capsuleSongs.$inferSelect;
export type WhisperNote = typeof whisperNotes.$inferSelect;
export type SuperSyncEvent = typeof superSyncEvents.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type FlashReaction = typeof flashReactions.$inferSelect;

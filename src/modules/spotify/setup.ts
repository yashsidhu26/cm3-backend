import { Database } from 'bun:sqlite';
import { join } from 'path';

const dbPath = join(process.cwd(), 'spotify.db');
const sqlite = new Database(dbPath);

console.log(`Initializing Spotify database at ${dbPath}...`);

// Create tables
sqlite.run(`
  CREATE TABLE IF NOT EXISTS spotify_users (
    id TEXT PRIMARY KEY,
    spotify_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER,
    created_at INTEGER
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS spotify_capsules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    is_flash_active INTEGER DEFAULT 0,
    flash_song_id TEXT
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS queued_songs (
    id TEXT PRIMARY KEY,
    capsule_id TEXT,
    spotify_track_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS capsule_songs (
    id TEXT PRIMARY KEY,
    capsule_id TEXT,
    spotify_track_id TEXT NOT NULL,
    added_at INTEGER
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS whisper_notes (
    id TEXT PRIMARY KEY,
    capsule_id TEXT,
    audio_blob_url TEXT,
    track_id TEXT,
    track_name TEXT,
    artist_name TEXT,
    created_at INTEGER
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS super_sync_events (
    id TEXT PRIMARY KEY,
    artist_id TEXT NOT NULL,
    user1_id TEXT NOT NULL,
    user2_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    queued_song_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER
  );
`);

sqlite.run(`
  CREATE TABLE IF NOT EXISTS flash_reactions (
    id TEXT PRIMARY KEY,
    capsule_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reaction TEXT NOT NULL,
    created_at INTEGER
  );
`);

console.log('Spotify tables initialized successfully.');
sqlite.close();

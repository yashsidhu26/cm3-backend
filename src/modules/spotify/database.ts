import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './spotify.schema';

const sqlite = new Database('spotify.db');
export const db = drizzle(sqlite, { schema });

// Initialize database (create tables if they don't exist)
// In a real production app, we'd use migrations, but for this module,
// we can use the run() command to ensure the db is ready.
// sqlite.run(`...`)

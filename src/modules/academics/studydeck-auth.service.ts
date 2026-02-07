/**
 * StudyDeck Auth Service
 * Handles secure token storage for StudyDeck API access
 */

import { db } from '../../core/database/client';
import { studyDeckToken } from './studydeck-auth.schema';
import { eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Encryption configuration (Same as Gmail Auth and Moodle Auth)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.warn('[studydeck-auth] WARNING: ENCRYPTION_KEY not set or too short. Token encryption disabled.');
}

/**
 * Encrypt a token using AES-256-GCM
 */
function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) return token;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a token using AES-256-GCM
 */
function decryptToken(encryptedToken: string): string {
  if (!ENCRYPTION_KEY) return encryptedToken;

  const parts = encryptedToken.split(':');
  if (parts.length !== 3) return encryptedToken;

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Store StudyDeck token for a user
 */
export async function storeToken(userId: string, token: string): Promise<void> {
  const encryptedToken = encryptToken(token);

  const existing = await db.query.studyDeckToken.findFirst({
    where: eq(studyDeckToken.userId, userId),
  });

  if (existing) {
    await db
      .update(studyDeckToken)
      .set({
        encryptedToken,
        updatedAt: new Date(),
      })
      .where(eq(studyDeckToken.userId, userId));
  } else {
    await db.insert(studyDeckToken).values({
      userId,
      encryptedToken,
    });
  }
}

/**
 * Get decrypted StudyDeck token for a user
 */
export async function getToken(userId: string): Promise<string | null> {
  const record = await db.query.studyDeckToken.findFirst({
    where: eq(studyDeckToken.userId, userId),
  });

  if (!record || !record.encryptedToken) return null;

  return decryptToken(record.encryptedToken);
}

/**
 * Check if user has StudyDeck token
 */
export async function hasToken(userId: string): Promise<boolean> {
  const record = await db.query.studyDeckToken.findFirst({
    where: eq(studyDeckToken.userId, userId),
  });

  return !!record;
}

/**
 * Delete StudyDeck token for a user
 */
export async function deleteToken(userId: string): Promise<void> {
  await db.delete(studyDeckToken).where(eq(studyDeckToken.userId, userId));
}


import { db } from '../../core/database/client';
import { moodleToken } from './moodle-auth.schema';
import { eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { moodleClient } from './moodle.service';

/**
 * Moodle Auth Service
 * Handles secure token storage and authentication management for Moodle
 */

// Encryption configuration (Same as Gmail Auth)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    console.warn('[moodle-auth] WARNING: ENCRYPTION_KEY not set or too short. Token encryption disabled.');
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
 * Authenticate user with Moodle and store token
 */
export async function login(userId: string, username: string, password: string): Promise<void> {
    // 1. Authenticate with Moodle to get token
    // Use the username as is (BITS ID usually)
    const response = await moodleClient.authenticate(username, password);

    // 2. Encrypt token
    const encryptedToken = encryptToken(response.token);

    // 3. Store in database (upsert)
    const existing = await db.query.moodleToken.findFirst({
        where: eq(moodleToken.userId, userId),
    });

    if (existing) {
        await db.update(moodleToken)
            .set({
                encryptedToken,
                moodleUserId: response.userId,
                moodleUsername: username,
                updatedAt: new Date(),
            })
            .where(eq(moodleToken.userId, userId));
    } else {
        await db.insert(moodleToken).values({
            userId,
            encryptedToken,
            moodleUserId: response.userId,
            moodleUsername: username,
        });
    }
}

/**
 * Get decrypted Moodle token for a user
 */
export async function getMoodleToken(userId: string): Promise<string | null> {
    const record = await db.query.moodleToken.findFirst({
        where: eq(moodleToken.userId, userId),
    });

    if (!record || !record.encryptedToken) return null;

    return decryptToken(record.encryptedToken);
}

/**
 * Get Moodle auth status
 */
export async function getAuthStatus(userId: string): Promise<{
    connected: boolean;
    moodleUserId?: string;
    moodleUsername?: string;
}> {
    const record = await db.query.moodleToken.findFirst({
        where: eq(moodleToken.userId, userId),
    });

    if (!record) {
        return { connected: false };
    }

    return {
        connected: true,
        moodleUserId: record.moodleUserId || undefined,
        moodleUsername: record.moodleUsername || undefined,
    };
}

/**
 * Get Moodle user ID for a local user
 */
export async function getMoodleUserId(userId: string): Promise<string | null> {
    const record = await db.query.moodleToken.findFirst({
        where: eq(moodleToken.userId, userId),
    });
    return record?.moodleUserId || null;
}

/**
 * Logout from Moodle integration (delete token)
 * Does NOT affect actual Moodle session, just removes our access
 */
export async function logout(userId: string): Promise<void> {
    await db.delete(moodleToken).where(eq(moodleToken.userId, userId));
}

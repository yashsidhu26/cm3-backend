import { google } from 'googleapis';
import { db } from '../../core/database/client';
import { gmailToken } from './gmail-auth.schema';
import { eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Gmail Auth Service - Production Implementation
 * Handles OAuth2 flow with secure database-backed token storage
 */

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.warn('[gmail-auth] WARNING: ENCRYPTION_KEY not set or too short. Token encryption disabled.');
}

/**
 * Encrypt a token using AES-256-GCM
 */
function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) return token; // Fallback to plaintext if no key

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
  if (!ENCRYPTION_KEY) return encryptedToken; // Fallback if no key

  const parts = encryptedToken.split(':');
  if (parts.length !== 3) return encryptedToken; // Not encrypted format

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
 * Get OAuth2 client instance
 */
function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  // Auto-derive redirect URI from BASE_URL (required), or allow override
  const baseUrl = process.env.BASE_URL;

  if (!baseUrl) {
    throw new Error('BASE_URL environment variable is required for Gmail OAuth');
  }

  const redirectUri = process.env.GMAIL_REDIRECT_URI || `${baseUrl}/auth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET');
  }

  console.log(`[Gmail OAuth] Using redirect URI: ${redirectUri}`);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate OAuth2 authorization URL
 */
export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens and store in database
 */
export async function exchangeCodeForTokens(code: string, userId: string): Promise<void> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  // Get user's Gmail email
  oauth2.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress || '';

  // Encrypt tokens
  const encryptedAccessToken = tokens.access_token ? encryptToken(tokens.access_token) : null;
  const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

  // Store in database (upsert)
  const existing = await db.query.gmailToken.findFirst({
    where: eq(gmailToken.userId, userId),
  });

  if (existing) {
    await db.update(gmailToken)
      .set({
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: tokens.scope || SCOPES.join(' '),
        email,
        updatedAt: new Date(),
      })
      .where(eq(gmailToken.userId, userId));
  } else {
    await db.insert(gmailToken).values({
      userId,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope || SCOPES.join(' '),
      email,
    });
  }
}

/**
 * Get stored tokens for a user
 */
async function getTokens(userId: string): Promise<{ access_token?: string; refresh_token?: string; expiry_date?: number } | null> {
  const record = await db.query.gmailToken.findFirst({
    where: eq(gmailToken.userId, userId),
  });

  if (!record) return null;

  return {
    access_token: record.encryptedAccessToken ? decryptToken(record.encryptedAccessToken) : undefined,
    refresh_token: record.encryptedRefreshToken ? decryptToken(record.encryptedRefreshToken) : undefined,
    expiry_date: record.tokenExpiry ? record.tokenExpiry.getTime() : undefined,
  };
}

/**
 * Get authenticated OAuth2 client for a user
 * Automatically refreshes tokens if expired
 */
export async function getAuthenticatedClient(userId: string) {
  const tokens = await getTokens(userId);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);

  // Listen for token refresh events
  oauth2.on('tokens', async (newTokens) => {
    const encryptedAccessToken = newTokens.access_token ? encryptToken(newTokens.access_token) : null;
    const encryptedRefreshToken = newTokens.refresh_token ? encryptToken(newTokens.refresh_token) : null;

    await db.update(gmailToken)
      .set({
        encryptedAccessToken: encryptedAccessToken || undefined,
        encryptedRefreshToken: encryptedRefreshToken || undefined,
        tokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(gmailToken.userId, userId));
  });

  return oauth2;
}

/**
 * Get auth status for a user
 */
export async function getAuthStatus(userId: string): Promise<{
  connected: boolean;
  email?: string;
  scope?: string;
}> {
  const record = await db.query.gmailToken.findFirst({
    where: eq(gmailToken.userId, userId),
  });

  if (!record || (!record.encryptedAccessToken && !record.encryptedRefreshToken)) {
    return { connected: false };
  }

  return {
    connected: true,
    email: record.email || undefined,
    scope: record.scope || undefined,
  };
}

/**
 * Revoke tokens and remove from database
 */
export async function revokeTokens(userId: string): Promise<void> {
  const tokens = await getTokens(userId);

  // Revoke with Google if we have a token
  if (tokens?.access_token) {
    try {
      const oauth2 = getOAuth2Client();
      await oauth2.revokeToken(tokens.access_token);
    } catch (error) {
      console.error('[gmail-auth] Failed to revoke token with Google:', error);
    }
  }

  // Remove from database
  await db.delete(gmailToken).where(eq(gmailToken.userId, userId));
}

/**
 * Get Gmail email address for a user
 */
export async function getGmailEmail(userId: string): Promise<string | null> {
  const record = await db.query.gmailToken.findFirst({
    where: eq(gmailToken.userId, userId),
    columns: { email: true },
  });

  return record?.email || null;
}

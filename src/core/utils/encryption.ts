/**
 * Encryption Utilities
 * Simple AES-256-GCM encryption for sensitive data
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment
 * Must be at least 32 characters
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }
  if (key.length < KEY_LENGTH) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  // Use first 32 bytes of the key
  return Buffer.from(key.slice(0, KEY_LENGTH), 'utf-8');
}

/**
 * Encrypt a string
 * Returns base64-encoded encrypted string with IV and auth tag prepended
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine: IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt a string
 * Expects base64-encoded string with IV and auth tag prepended
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedText, 'base64');

  // Extract: IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

import { google } from 'googleapis';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_USER_ID = 'default';
const TOKEN_STORE_FILE = '.token-store.json';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

export type StorageType = 'memory' | 'file' | 'redis';

export interface TokenStoreRecord {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
}

export interface AuthStatus {
  tokensStored: boolean;
  envTokenPresent: boolean;
  storageType: StorageType;
  storageConnected: boolean;
}

const memoryStore = new Map<string, TokenStoreRecord>();

/** Only for tests: clears in-memory token store. */
export function clearTokenStoreForTesting(): void {
  memoryStore.clear();
}

function getTokenStorePath(): string {
  return join(process.cwd(), TOKEN_STORE_FILE);
}

function readFileStore(): Record<string, TokenStoreRecord> {
  const path = getTokenStorePath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Record<string, TokenStoreRecord>;
  } catch {
    return {};
  }
}

function writeFileStore(data: Record<string, TokenStoreRecord>): void {
  const path = getTokenStorePath();
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[gmail-auth] Failed to write token store:', e);
  }
}

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REDIRECT_URI');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  await setTokens(DEFAULT_USER_ID, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
  });
}

export async function setTokens(userId: string, record: TokenStoreRecord): Promise<void> {
  memoryStore.set(userId, record);
  const path = getTokenStorePath();
  try {
    const data = readFileStore();
    data[userId] = record;
    writeFileStore(data);
  } catch {
    // file persistence optional
  }
}

export async function getTokens(userId: string): Promise<TokenStoreRecord | null> {
  const fromMemory = memoryStore.get(userId);
  if (fromMemory?.access_token || fromMemory?.refresh_token) return fromMemory;
  const path = getTokenStorePath();
  if (!existsSync(path)) return null;
  const data = readFileStore();
  const fromFile = data[userId] ?? null;
  if (fromFile) memoryStore.set(userId, fromFile);
  return fromFile;
}

export function getAuthStatus(): AuthStatus {
  const envTokenPresent = !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REDIRECT_URI
  );
  const fromMemory = memoryStore.get(DEFAULT_USER_ID);
  let tokensStored = !!(fromMemory?.access_token || fromMemory?.refresh_token);
  if (!tokensStored) {
    const fileData = readFileStore();
    const fromFile = fileData[DEFAULT_USER_ID];
    tokensStored = !!(fromFile?.access_token || fromFile?.refresh_token);
  }
  const storageType: StorageType = 'file';
  const storageConnected = true;
  return {
    tokensStored,
    envTokenPresent,
    storageType,
    storageConnected,
  };
}

export async function getAuthenticatedClient() {
  const tokens = await getTokens(DEFAULT_USER_ID);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  oauth2.on('tokens', (newTokens) => {
    setTokens(DEFAULT_USER_ID, {
      ...tokens,
      access_token: newTokens.access_token ?? tokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date ?? tokens.expiry_date,
    });
  });
  return oauth2;
}

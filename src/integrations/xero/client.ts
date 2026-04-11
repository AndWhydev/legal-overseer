/**
 * Xero API client for BitBit
 *
 * Handles OAuth 2.0 authentication and provides typed methods for Xero API.
 * CRITICAL: Only creates DRAFT invoices - never AUTHORISED.
 *
 * Protected by circuit breaker to handle Xero API outages gracefully.
 */

import { XeroClient } from 'xero-node';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createCircuitBreaker, createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('XeroClient');

const XERO_TOKEN_ENCRYPTION_KEY = process.env.XERO_TOKEN_ENCRYPTION_KEY;
if (!XERO_TOKEN_ENCRYPTION_KEY) {
  logger.warn('XERO_TOKEN_ENCRYPTION_KEY not set — tokens will be stored in plaintext');
}

// Xero scopes for accounting
const XERO_SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access';

// Singleton Xero client
let xeroClient: XeroClient | null = null;

/**
 * Initialize Xero client with credentials from environment
 */
export function initXeroClient(): XeroClient {
  if (xeroClient) return xeroClient;

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set');
  }

  xeroClient = new XeroClient({
    clientId,
    clientSecret,
    redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/xero/callback'],
    scopes: XERO_SCOPES.split(' ')
  });

  logger.info('Xero client initialized');
  return xeroClient;
}

/**
 * Get Xero client (initialize if needed)
 */
export function getXeroClient(): XeroClient {
  if (!xeroClient) {
    return initXeroClient();
  }
  return xeroClient;
}

/**
 * Token storage in SQLite (simple key-value)
 * Encrypted at rest with AES-256-GCM when XERO_TOKEN_ENCRYPTION_KEY is set
 */
interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  tenant_id: string;
}

function encryptToken(text: string): string {
  if (!XERO_TOKEN_ENCRYPTION_KEY) return text;
  const keyBuf = Buffer.from(XERO_TOKEN_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptToken(data: string): string {
  if (!XERO_TOKEN_ENCRYPTION_KEY) return data;
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 16);
  const authTag = buf.subarray(16, 32);
  const encrypted = buf.subarray(32);
  const keyBuf = Buffer.from(XERO_TOKEN_ENCRYPTION_KEY, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Save Xero token set to database
 */
export function saveTokenSet(tokenSet: StoredToken): void {
  const db = getDatabase();
  const json = JSON.stringify(tokenSet);
  const stored = encryptToken(json);

  db.prepare(`
    INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
    VALUES ('xero_token', ?, datetime('now'))
  `).run(stored);

  logger.info('Token set saved (encrypted)');
}

/**
 * Load Xero token set from database
 */
export function loadTokenSet(): StoredToken | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT value FROM key_value_store WHERE key = 'xero_token'
  `).get() as { value: string } | undefined;

  if (!row) return null;

  try {
    const json = decryptToken(row.value);
    return JSON.parse(json) as StoredToken;
  } catch {
    return null;
  }
}

/**
 * Internal function to ensure valid token (wrapped by circuit breaker)
 */
async function ensureValidTokenInternal(): Promise<string> {
  const xero = getXeroClient();
  const stored = loadTokenSet();

  if (!stored) {
    throw new Error('No Xero token stored. Run /xero-auth to authenticate.');
  }

  // Check if token is expired (with 5-minute buffer)
  const now = Date.now();
  const expiresAt = stored.expires_at * 1000; // Convert to ms

  if (now > expiresAt - 5 * 60 * 1000) {
    logger.info('Token expired, refreshing...');

    // Refresh the token
    xero.setTokenSet({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
      expires_at: stored.expires_at,
      token_type: 'Bearer',
      scope: XERO_SCOPES
    });

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('XERO_CLIENT_ID and XERO_CLIENT_SECRET must be set');
    }

    const newTokenSet = await xero.refreshWithRefreshToken(
      clientId,
      clientSecret,
      stored.refresh_token
    );

    // Save new token
    saveTokenSet({
      access_token: newTokenSet.access_token as string,
      refresh_token: newTokenSet.refresh_token as string,
      expires_at: newTokenSet.expires_at as number,
      tenant_id: stored.tenant_id
    });

    logger.info('Token refreshed successfully');
    return stored.tenant_id;
  }

  // Token still valid
  xero.setTokenSet({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expires_at: stored.expires_at,
    token_type: 'Bearer',
    scope: XERO_SCOPES
  });

  return stored.tenant_id;
}

/**
 * Circuit breaker for Xero API
 * - Timeout: 10000ms (OAuth can be slow)
 * - Error threshold: 50%
 * - Reset timeout: 30000ms
 */
const xeroBreaker = createCircuitBreaker<string>(
  'xero',
  ensureValidTokenInternal as unknown as (...args: unknown[]) => Promise<string>,
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

/**
 * Ensure we have a valid token, refreshing if needed
 * Protected by circuit breaker for resilience.
 */
export async function ensureValidToken(): Promise<string> {
  try {
    const result = await xeroBreaker.fire() as string;
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Xero token validation failed', { error: errorMsg });
    throw new Error(`Xero unavailable: ${errorMsg}`);
  }
}

/**
 * Check if Xero is configured and authenticated
 */
export function isXeroConfigured(): boolean {
  return !!process.env.XERO_CLIENT_ID &&
         !!process.env.XERO_CLIENT_SECRET &&
         !!loadTokenSet();
}

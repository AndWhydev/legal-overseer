/**
 * API Key Validation and Management
 *
 * Provides utilities for validating, storing, and managing API keys securely.
 * Follows DI pattern: all functions accept SupabaseClient as first parameter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface APIKeyValidationRule {
  name: string;
  test: (key: string) => boolean;
  error: string;
}

export interface APIKeyMetadata {
  id: string;
  name: string;
  key_hash: string;
  last_used?: string;
  created_at: string;
  expires_at?: string;
  is_active: boolean;
}

export interface KeyValidationResult {
  valid: boolean;
  key_type?: string;
  issues: string[];
}

// ─── Standard validation rules ───────────────────────────────────────────

const VALIDATION_RULES: Record<string, APIKeyValidationRule[]> = {
  anthropic: [
    {
      name: 'prefix',
      test: (key) => key.startsWith('sk-ant-'),
      error: 'Anthropic keys must start with "sk-ant-"',
    },
    {
      name: 'length',
      test: (key) => key.length >= 48,
      error: 'Anthropic keys must be at least 48 characters',
    },
  ],
  supabase: [
    {
      name: 'format',
      test: (key) => /^[a-zA-Z0-9_-]{40,}$/.test(key),
      error: 'Supabase keys must be alphanumeric with hyphens/underscores',
    },
    {
      name: 'length',
      test: (key) => key.length >= 40,
      error: 'Supabase keys must be at least 40 characters',
    },
  ],
  openai: [
    {
      name: 'prefix',
      test: (key) => key.startsWith('sk-'),
      error: 'OpenAI keys must start with "sk-"',
    },
    {
      name: 'length',
      test: (key) => key.length >= 40,
      error: 'OpenAI keys must be at least 40 characters',
    },
  ],
  stripe: [
    {
      name: 'prefix_secret',
      test: (key) => key.startsWith('sk_live_') || key.startsWith('sk_test_'),
      error: 'Stripe secret keys must start with "sk_live_" or "sk_test_"',
    },
    {
      name: 'length',
      test: (key) => key.length >= 48,
      error: 'Stripe keys must be at least 48 characters',
    },
  ],
};

// ─── Key type detection ──────────────────────────────────────────────────

/**
 * Detect the type of API key based on format.
 */
export function detectKeyType(key: string): string | null {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('sk_')) return 'stripe';
  if (/^[a-zA-Z0-9_-]{40,}$/.test(key)) return 'supabase'; // Fallback for generic format

  return null;
}

// ─── Validation ──────────────────────────────────────────────────────────

/**
 * Validate an API key against known patterns.
 */
export function validateAPIKey(key: string, keyType?: string): KeyValidationResult {
  const issues: string[] = [];

  if (!key) {
    return { valid: false, issues: ['API key is required'] };
  }

  if (key.length < 20) {
    return { valid: false, issues: ['API key is too short (minimum 20 characters)'] };
  }

  if (key.includes(' ')) {
    return { valid: false, issues: ['API key cannot contain spaces'] };
  }

  if (key.includes('\n') || key.includes('\r')) {
    return { valid: false, issues: ['API key cannot contain newlines'] };
  }

  const detectedType = keyType || detectKeyType(key);

  if (detectedType && VALIDATION_RULES[detectedType]) {
    const rules = VALIDATION_RULES[detectedType];
    for (const rule of rules) {
      if (!rule.test(key)) {
        issues.push(rule.error);
      }
    }
  }

  return {
    valid: issues.length === 0,
    key_type: detectedType || 'unknown',
    issues,
  };
}

// ─── Secure storage helpers ──────────────────────────────────────────────

/**
 * Hash a key for secure storage (one-way).
 */
export async function hashKey(key: string): Promise<string> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback if SubtleCrypto not available
  }

  // Fallback: simple hash using .repeat and charCodeAt
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit
  }
  return Math.abs(hash).toString(16);
}

/**
 * Mask a key for logging (keep first 4 and last 4 chars).
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) {
    return '****';
  }
  return `${key.slice(0, 4)}${'*'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

// ─── Storage and rotation ────────────────────────────────────────────────

/**
 * Record API key usage (last_used timestamp).
 */
export async function recordKeyUsage(
  supabase: SupabaseClient,
  keyHash: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('key_hash', keyHash);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Store an API key securely in the database.
 */
export async function storeAPIKey(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  key: string,
  expiresAt?: Date
): Promise<{ id: string } | null> {
  const validation = validateAPIKey(key);
  if (!validation.valid) {
    throw new Error(`Invalid API key: ${validation.issues.join(', ')}`);
  }

  const keyHash = await hashKey(key);

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        org_id: orgId,
        name,
        key_hash: keyHash,
        key_type: validation.key_type,
        is_active: true,
        expires_at: expiresAt?.toISOString() || null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data as { id: string };
  } catch (err) {
    logger.error('[api-key] Failed to store key:', err);
    return null;
  }
}

/**
 * Get keys that are expired or due for rotation.
 */
export async function getExpiredKeys(supabase: SupabaseClient): Promise<APIKeyMetadata[]> {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .lt('expires_at', new Date().toISOString())
      .eq('is_active', true);

    if (error) throw error;
    return data as APIKeyMetadata[];
  } catch (err) {
    logger.warn('[api-key] Failed to fetch expired keys:', err);
    return [];
  }
}

/**
 * Revoke/deactivate an API key.
 */
export async function revokeAPIKey(supabase: SupabaseClient, keyId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId);

    return !error;
  } catch (err) {
    logger.error('[api-key] Failed to revoke key:', err);
    return false;
  }
}

/**
 * Rotate an API key (deactivate old, create new).
 */
export async function rotateAPIKey(
  supabase: SupabaseClient,
  keyId: string,
  orgId: string,
  keyName: string,
  newKey: string,
  expiresAt?: Date
): Promise<{ newKeyId: string } | null> {
  try {
    // Deactivate old key
    const { error: revokeError } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId);

    if (revokeError) throw revokeError;

    // Store new key
    const result = await storeAPIKey(supabase, orgId, keyName, newKey, expiresAt);
    if (!result) throw new Error('Failed to store new key');

    return { newKeyId: result.id };
  } catch (err) {
    logger.error('[api-key] Failed to rotate key:', err);
    return null;
  }
}

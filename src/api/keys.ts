/**
 * API key management for the REST API + Zapier webhooks.
 *
 * Keys are hashed with SHA-256 + a random prefix that lets us identify
 * which key matched without storing plaintext. Prefix is shown in the
 * UI so admins can recognise their keys.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { appendLegalAudit } from '../compliance/audit.js';

export interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  created_by: string;
  scopes: string;
  rate_limit_per_min: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CreateApiKeyResult {
  key: ApiKey;
  /** Plaintext key — shown ONCE to the operator. Never stored. */
  plaintext: string;
}

function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function createApiKey(input: { name: string; createdBy: string; scopes?: string[]; rateLimitPerMin?: number }): CreateApiKeyResult {
  const db = getDatabase();
  const id = randomUUID();
  const prefix = `lo_${randomBytes(4).toString('hex')}`;
  const secret = randomBytes(32).toString('hex');
  const plaintext = `${prefix}.${secret}`;
  const hash = hashKey(plaintext);
  db.prepare(
    `INSERT INTO api_keys (id, name, key_hash, key_prefix, created_by, scopes, rate_limit_per_min)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, hash, prefix, input.createdBy, JSON.stringify(input.scopes ?? ['*']), input.rateLimitPerMin ?? 60);
  appendLegalAudit({
    matterId: null,
    actorId: input.createdBy,
    action: 'api_key.create',
    detail: `${input.name} (${prefix})`,
    refTable: 'api_keys',
    refId: id,
  });
  return { key: getApiKey(id) as ApiKey, plaintext };
}

export function getApiKey(id: string): ApiKey | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKey | undefined) ?? null;
}

export function authenticateApiKey(plaintext: string): ApiKey | null {
  const hash = hashKey(plaintext);
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`)
    .get(hash) as ApiKey | undefined;
  if (!row) return null;
  db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  return row;
}

export function revokeApiKey(id: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'api_key.revoke',
    detail: id,
    refTable: 'api_keys',
    refId: id,
  });
}

export function listApiKeys(): ApiKey[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC`)
    .all() as ApiKey[];
}

export function logApiRequest(apiKeyId: string | null, method: string, path: string, status: number, durationMs: number, ip: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO api_request_log (id, api_key_id, method, path, status, duration_ms, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), apiKeyId, method, path, status, durationMs, ip);
}

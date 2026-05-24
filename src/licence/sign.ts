/**
 * Licence signing / verification.
 *
 * Format: LO1.<base64url(json_payload)>.<base64url(hmac_sha256)>
 *
 * The signing secret is a single string baked into the product at
 * build time. Customers cannot forge a licence without this secret.
 * **Replace the default before any commercial release** — the value
 * shipped in source is a placeholder, not a production secret.
 *
 * To rotate: set LICENCE_SIGNING_SECRET in the environment for both
 * the licence generator AND the deployed product. Old licences will
 * stop validating, so plan rotations as a hard cutover.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LicencePayload } from './types.js';

/**
 * Default signing secret. **Replace before commercial deployment** by
 * setting LICENCE_SIGNING_SECRET in the environment for both the
 * vendor's licence generator and every deployed instance.
 *
 * Shipping a default value in source lets the build come out of the
 * box for evaluation. A determined customer could read this and mint
 * a licence — that's a known trade-off of on-prem HMAC. For higher
 * assurance, swap to the Ed25519 path described in SECURITY.md.
 */
const DEFAULT_SIGNING_SECRET =
  'LO-DEFAULT-PLACEHOLDER-SECRET-REPLACE-BEFORE-COMMERCIAL-DEPLOYMENT-' +
  '9f6a83be4c1d8e2a47f93b6c5e0a1d8e';

const TOKEN_PREFIX = 'LO1';

function getSecret(): string {
  return process.env.LICENCE_SIGNING_SECRET || DEFAULT_SIGNING_SECRET;
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function hmac(payload: string): Buffer {
  return createHmac('sha256', getSecret()).update(payload).digest();
}

export function signLicence(payload: LicencePayload): string {
  const canonical = JSON.stringify(payload);
  const sig = hmac(canonical);
  return `${TOKEN_PREFIX}.${b64urlEncode(canonical)}.${b64urlEncode(sig)}`;
}

export type VerifyResult =
  | { ok: true; payload: LicencePayload }
  | { ok: false; reason: string };

export function verifyLicence(token: string): VerifyResult {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: 'empty token' };

  const parts = trimmed.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [prefix, b64Payload, b64Sig] = parts;
  if (prefix !== TOKEN_PREFIX) return { ok: false, reason: `unknown prefix ${prefix}` };

  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  try {
    payloadBuf = b64urlDecode(b64Payload);
    sigBuf = b64urlDecode(b64Sig);
  } catch {
    return { ok: false, reason: 'malformed base64' };
  }

  const expected = hmac(payloadBuf.toString('utf8'));
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) {
    return { ok: false, reason: 'signature mismatch' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return { ok: false, reason: 'payload is not JSON' };
  }
  if (!isLicencePayload(parsed)) {
    return { ok: false, reason: 'payload schema invalid' };
  }
  return { ok: true, payload: parsed };
}

function isLicencePayload(x: unknown): x is LicencePayload {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  if (r.v !== 1) return false;
  if (typeof r.licence_id !== 'string') return false;
  if (typeof r.tier !== 'string') return false;
  if (!['trial', 'small_firm', 'mid_firm', 'enterprise'].includes(r.tier as string)) return false;
  if (typeof r.firm_name !== 'string') return false;
  if (typeof r.firm_domain !== 'string') return false;
  if (typeof r.issued_at !== 'string') return false;
  if (typeof r.expires_at !== 'string') return false;
  if (!r.limits || typeof r.limits !== 'object') return false;
  const limits = r.limits as Record<string, unknown>;
  if (typeof limits.max_users !== 'number') return false;
  if (typeof limits.max_matters !== 'number') return false;
  return true;
}

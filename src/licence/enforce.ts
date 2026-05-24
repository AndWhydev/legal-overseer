/**
 * Tier enforcement.
 *
 * Call these helpers anywhere a write would push the firm past its
 * licensed seat or matter cap. They throw `LicenceLimitError` rather
 * than silently dropping the request — the caller is expected to
 * surface a clear "upgrade your plan" message.
 *
 * Read-only callers (dashboard views, briefing aggregation) should
 * never see a thrown error from this module.
 */

import { getDatabase } from '../db/connection.js';
import { getLicenceState } from './state.js';
import { TIER_LIMITS } from './types.js';

export class LicenceLimitError extends Error {
  readonly kind: 'expired' | 'user_limit' | 'matter_limit' | 'domain_mismatch';
  constructor(kind: LicenceLimitError['kind'], message: string) {
    super(message);
    this.name = 'LicenceLimitError';
    this.kind = kind;
  }
}

function countActiveUsers(): number {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE status = 'active'`)
    .get() as { n: number };
  return row.n;
}

function countOpenMatters(): number {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM matters WHERE status IN ('open', 'on_hold')`)
    .get() as { n: number };
  return row.n;
}

export function assertWritable(): void {
  const status = getLicenceState();
  if (status.readOnly || !status.valid) {
    throw new LicenceLimitError('expired', status.message);
  }
}

export function assertCanAddUser(): void {
  assertWritable();
  const status = getLicenceState();
  if (!status.payload) return;
  const limit = status.payload.limits.max_users;
  const current = countActiveUsers();
  if (current >= limit) {
    throw new LicenceLimitError(
      'user_limit',
      `User limit reached (${current}/${limit} on ${TIER_LIMITS[status.payload.tier].label}). ` +
        `Upgrade your licence to add more lawyers.`,
    );
  }
}

export function assertCanCreateMatter(): void {
  assertWritable();
  const status = getLicenceState();
  if (!status.payload) return;
  const limit = status.payload.limits.max_matters;
  const current = countOpenMatters();
  if (current >= limit) {
    throw new LicenceLimitError(
      'matter_limit',
      `Active matter limit reached (${current}/${limit} on ${TIER_LIMITS[status.payload.tier].label}). ` +
        `Close or archive existing matters, or upgrade your licence.`,
    );
  }
}

export interface UsageSnapshot {
  tier: string;
  tierLabel: string;
  users: { current: number; limit: number; percent: number };
  matters: { current: number; limit: number; percent: number };
  warnings: string[];
}

export function getUsageSnapshot(): UsageSnapshot {
  const status = getLicenceState();
  const tier = status.payload?.tier ?? 'trial';
  const limits = status.payload?.limits ?? TIER_LIMITS.trial;
  const users = countActiveUsers();
  const matters = countOpenMatters();
  const warnings: string[] = [];

  const userPct = limits.max_users > 0 ? Math.round((users / limits.max_users) * 100) : 0;
  const matterPct = limits.max_matters > 0 ? Math.round((matters / limits.max_matters) * 100) : 0;

  if (userPct >= 80 && Number.isFinite(limits.max_users) && limits.max_users < Number.MAX_SAFE_INTEGER) {
    warnings.push(`Lawyer seats at ${userPct}% of plan (${users}/${limits.max_users}).`);
  }
  if (matterPct >= 80 && Number.isFinite(limits.max_matters) && limits.max_matters < Number.MAX_SAFE_INTEGER) {
    warnings.push(`Active matters at ${matterPct}% of plan (${matters}/${limits.max_matters}).`);
  }

  return {
    tier,
    tierLabel: TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.label ?? tier,
    users: { current: users, limit: limits.max_users, percent: userPct },
    matters: { current: matters, limit: limits.max_matters, percent: matterPct },
    warnings,
  };
}

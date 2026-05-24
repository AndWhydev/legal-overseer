/**
 * Licence loader.
 *
 * Resolves the active licence at boot. Sources, in order:
 *
 *   1. LICENCE_KEY  — raw token in the environment (most CI / docker setups).
 *   2. LICENCE_FILE — path to a file containing the raw token. Default:
 *                     /data/licence.key in prod, ./data/licence.key in dev.
 *
 * If neither is set, a trial licence is synthesised with a short
 * expiry window so the firm can evaluate before paying. The trial
 * licence is signed at boot with the runtime's signing secret, which
 * is fine — its sole purpose is to flow through the same validation
 * path as a real licence.
 */

import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createSafeLogger } from '../governance/index.js';
import { signLicence, verifyLicence } from './sign.js';
import { TIER_LIMITS, type LicencePayload, type LicenceStatus } from './types.js';

const logger = createSafeLogger('Licence');

const TRIAL_DAYS = 14;
const RENEWAL_WARN_DAYS = 30;

function defaultLicenceFile(): string {
  if (process.env.LICENCE_FILE) return process.env.LICENCE_FILE;
  if (process.env.NODE_ENV === 'production') return '/data/licence.key';
  return './data/licence.key';
}

function readToken(): { token: string; source: 'env' | 'file' } | null {
  const envToken = process.env.LICENCE_KEY?.trim();
  if (envToken) return { token: envToken, source: 'env' };

  const file = defaultLicenceFile();
  if (existsSync(file)) {
    try {
      const token = readFileSync(file, 'utf8').trim();
      if (token) return { token, source: 'file' };
    } catch (err) {
      logger.warn(`could not read licence file ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

function buildTrialPayload(): LicencePayload {
  const issued = new Date();
  const expires = new Date(issued.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return {
    v: 1,
    licence_id: `trial-${randomUUID().slice(0, 8)}`,
    tier: 'trial',
    firm_name: 'Trial Licence',
    firm_domain: 'example.invalid',
    limits: TIER_LIMITS.trial,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function loadLicenceStatus(now: Date = new Date()): LicenceStatus {
  const found = readToken();

  if (!found) {
    const trial = buildTrialPayload();
    // Self-sign trial so downstream code uses the same payload shape.
    const verified = verifyLicence(signLicence(trial));
    if (!verified.ok) {
      return {
        valid: false,
        readOnly: true,
        message: 'No licence installed and trial bootstrap failed; system is unlicensed.',
        daysUntilExpiry: null,
        payload: null,
        source: 'none',
      };
    }
    const days = daysBetween(now.toISOString(), trial.expires_at);
    return {
      valid: true,
      readOnly: false,
      message:
        `Trial mode — ${days} day(s) left. ` +
        `Install a licence key at ${defaultLicenceFile()} to continue past the trial.`,
      daysUntilExpiry: days,
      payload: verified.payload,
      source: 'none',
    };
  }

  const verified = verifyLicence(found.token);
  if (!verified.ok) {
    return {
      valid: false,
      readOnly: true,
      message:
        `Licence rejected: ${verified.reason}. ` +
        `System is in read-only mode. Contact your Legal Overseer vendor for a valid key.`,
      daysUntilExpiry: null,
      payload: null,
      source: found.source,
    };
  }

  const expires = new Date(verified.payload.expires_at).getTime();
  const nowMs = now.getTime();
  const days = Math.round((expires - nowMs) / (1000 * 60 * 60 * 24));

  if (nowMs > expires) {
    return {
      valid: false,
      readOnly: true,
      message:
        `Licence expired on ${verified.payload.expires_at.slice(0, 10)}. ` +
        `Existing data remains accessible. Renew the licence to resume new matter intake.`,
      daysUntilExpiry: days,
      payload: verified.payload,
      source: found.source,
    };
  }

  const warn =
    days <= RENEWAL_WARN_DAYS
      ? ` — renewal due in ${days} day(s). Contact your vendor.`
      : '';

  return {
    valid: true,
    readOnly: false,
    message:
      `Licensed to ${verified.payload.firm_name} ` +
      `(${TIER_LIMITS[verified.payload.tier].label}, expires ${verified.payload.expires_at.slice(0, 10)})${warn}`,
    daysUntilExpiry: days,
    payload: verified.payload,
    source: found.source,
  };
}

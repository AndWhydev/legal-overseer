/**
 * Cached licence state.
 *
 * The licence is verified once at boot, then re-checked hourly. Every
 * mutating code path (matter creation, user creation, skill execution)
 * should call `getLicenceState()` and either short-circuit on
 * `readOnly` or enforce the tier limits via the helpers in
 * `enforce.ts`.
 */

import { createSafeLogger } from '../governance/index.js';
import { loadLicenceStatus } from './loader.js';
import type { LicenceStatus } from './types.js';

const logger = createSafeLogger('Licence');
const RECHECK_MS = 60 * 60 * 1000; // 1 hour

let cached: LicenceStatus | null = null;
let lastLoaded = 0;
let recheckTimer: NodeJS.Timeout | null = null;

export function getLicenceState(): LicenceStatus {
  const now = Date.now();
  if (!cached || now - lastLoaded > RECHECK_MS) {
    cached = loadLicenceStatus();
    lastLoaded = now;
  }
  return cached;
}

export function refreshLicenceState(): LicenceStatus {
  cached = loadLicenceStatus();
  lastLoaded = Date.now();
  return cached;
}

export function startLicenceRecheck(): void {
  if (recheckTimer) return;
  recheckTimer = setInterval(() => {
    const before = cached?.valid;
    const fresh = refreshLicenceState();
    if (before !== fresh.valid) {
      logger.warn(`licence state changed: ${fresh.message}`);
    }
  }, RECHECK_MS);
  // Don't block process exit on the timer.
  if (recheckTimer.unref) recheckTimer.unref();
}

export function stopLicenceRecheck(): void {
  if (recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
}

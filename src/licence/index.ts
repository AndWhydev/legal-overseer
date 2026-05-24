/**
 * Licence module — public surface.
 *
 * Boot order:
 *   1. initializeDatabase()
 *   2. getLicenceState()   ← verifies licence once
 *   3. startLicenceRecheck()
 *
 * Everything else (dashboard, skills, intake) reads the cached state
 * via `getLicenceState()` and enforces caps via the `assertCan*`
 * helpers from `enforce.ts`.
 */

export { signLicence, verifyLicence } from './sign.js';
export { loadLicenceStatus } from './loader.js';
export {
  getLicenceState,
  refreshLicenceState,
  startLicenceRecheck,
  stopLicenceRecheck,
} from './state.js';
export {
  assertWritable,
  assertCanAddUser,
  assertCanCreateMatter,
  getUsageSnapshot,
  LicenceLimitError,
  type UsageSnapshot,
} from './enforce.js';
export type { LicencePayload, LicenceStatus, LicenceTier } from './types.js';
export { TIER_LIMITS } from './types.js';

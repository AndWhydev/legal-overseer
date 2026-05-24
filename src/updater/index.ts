/**
 * Updater module — public surface.
 *
 * - getCurrentVersion()    Local product version (from package.json).
 * - runUpdateCheck()       One-shot manifest fetch.
 * - startUpdateChecks()    Daily background poll.
 * - getUpdateState()       Cached result for the dashboard / /health.
 */

export { getCurrentVersion, semverCompare } from './version.js';
export {
  runUpdateCheck,
  startUpdateChecks,
  stopUpdateChecks,
  getUpdateState,
} from './check.js';
export type { UpdateManifest, UpdateState } from './types.js';

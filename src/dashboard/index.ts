/**
 * Dashboard module — local read-only HTTP view of the overseer fleet.
 *
 * - aggregator.ts: SQLite reads → fleet + per-project view models
 * - render.ts:     plain-template HTML rendering, no framework
 * - server.ts:     tiny node:http server, 127.0.0.1 only
 */

export { startDashboard, type DashboardServer } from './server.js';
export {
  buildFleetSummary,
  buildProjectDetail,
  type FleetSummary,
  type ProjectDetail,
  type ProjectFleetRow,
  type FleetHealth,
} from './aggregator.js';

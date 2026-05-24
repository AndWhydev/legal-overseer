/**
 * Dashboard module — local HTTP view of Legal Overseer.
 *
 * - aggregator.ts: SQLite reads → matter / review / calendar / billing views
 * - render.ts:     plain-template HTML rendering, no framework
 * - server.ts:     tiny node:http server bound to 127.0.0.1
 */

export { startDashboard, type DashboardServer } from './server.js';
export {
  buildMatterSummary,
  buildMatterDetail,
  buildReviewQueueView,
  buildCalendarView,
  buildBillingTrackerView,
  getReviewWithMatter,
  type MatterSummary,
  type MatterRow,
  type MatterDetail,
  type MatterHealth,
  type ReviewQueueView,
  type CalendarView,
  type CalendarEntry,
  type BillingTrackerView,
  type BillingTrackerRow,
} from './aggregator.js';

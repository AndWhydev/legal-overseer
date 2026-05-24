/**
 * Inbox Monitor — public surface.
 *
 * Polls four dedicated email inboxes over IMAP every two minutes.
 * Each inbox routes to a different downstream pipeline:
 *
 *   legal_intake → src/legal-intake (matter creation, intake reply)
 *   client       → correspondence pipeline → tasks tagged client_correspondence
 *   court        → correspondence pipeline → tasks tagged court_correspondence
 *   internal     → correspondence pipeline → tasks tagged internal_ops
 *
 * Wiring:
 *   - Init via initInboxMonitor() — gated on ENABLE_INBOX_MONITOR=true.
 *   - Standalone CLI: scripts/inbox-monitor.ts (npm run inbox:monitor).
 *   - Wired into scripts/overseer-start.ts so the daemon brings it up
 *     alongside the overseer loop and task processor.
 *
 * Per-inbox env config (each slot is optional — leave unset to skip):
 *   LEGAL_EMAIL    / LEGAL_EMAIL_PASS    / LEGAL_EMAIL_IMAP_HOST    / ...
 *   CLIENT_EMAIL   / CLIENT_EMAIL_PASS   / CLIENT_EMAIL_IMAP_HOST   / ...
 *   COURT_EMAIL    / COURT_EMAIL_PASS    / COURT_EMAIL_IMAP_HOST    / ...
 *   INTERNAL_EMAIL / INTERNAL_EMAIL_PASS / INTERNAL_EMAIL_IMAP_HOST / ...
 *
 * IMAP/SMTP host + port default to known providers (Gmail / O365 /
 * iCloud / Fastmail / Zoho) when the inbox domain matches.
 */

import { createSafeLogger } from '../governance/index.js';
import { startInboxMonitor, DEFAULT_POLL_INTERVAL_MS } from './poller.js';
import { resolveAllInboxes } from './config.js';

const logger = createSafeLogger('InboxMonitor');

export type { InboxType, IncomingEmail, PipelineResult, SavedAttachment, ResolvedInboxConfig, InboxSlotMeta } from './types.js';
export { INBOX_SLOTS, resolveInboxConfig, resolveAllInboxes } from './config.js';
export { fetchUnseenEmails } from './client.js';
export { routeEmail } from './router.js';
export { sendAutoReply } from './reply.js';
export {
  runPollTick,
  startInboxMonitor,
  stopInboxMonitor,
  isInboxMonitorRunning,
  DEFAULT_POLL_INTERVAL_MS,
} from './poller.js';
export { getPipelineHandler } from './pipelines/index.js';

export function initInboxMonitor(intervalMs = DEFAULT_POLL_INTERVAL_MS): boolean {
  if (process.env.ENABLE_INBOX_MONITOR !== 'true') {
    logger.info('Disabled (set ENABLE_INBOX_MONITOR=true to enable IMAP polling)');
    return false;
  }

  const inboxes = resolveAllInboxes();
  if (inboxes.length === 0) {
    logger.warn(
      'ENABLE_INBOX_MONITOR=true but no inboxes are configured. Set at least one <SLUG>_EMAIL + <SLUG>_EMAIL_PASS pair.',
    );
    return false;
  }

  logger.info(`Configured inboxes (${inboxes.length}): ${inboxes.map((i) => `${i.meta.type} (${i.address})`).join(', ')}`);
  startInboxMonitor(intervalMs);
  return true;
}

/**
 * Inbox Monitor — public surface.
 *
 * Polls five dedicated email inboxes (SOFTWARE, SEO, DESIGN, CONTENT,
 * OPS) over IMAP every two minutes. Each inbox routes to a different
 * downstream pipeline:
 *
 *   software → src/intake (scope intake → new project)
 *   seo      → src/skills/seo-backlinks (dispatchBacklinkCampaign)
 *   design   → tasks table tagged pipeline_type=design
 *   content  → tasks table tagged pipeline_type=content
 *   ops      → tasks table tagged pipeline_type=ops
 *
 * Wiring:
 *   - Init via initInboxMonitor() — gated on ENABLE_INBOX_MONITOR=true.
 *   - Standalone CLI: scripts/inbox-monitor.ts (npm run inbox:monitor).
 *   - Wired into scripts/overseer-start.ts so the daemon brings it up
 *     alongside the overseer loop and task processor.
 *
 * Per-inbox env config (each slot is optional — leave unset to skip):
 *   SOFTWARE_EMAIL / SOFTWARE_EMAIL_PASS / SOFTWARE_EMAIL_IMAP_HOST / ...
 *   SEO_EMAIL      / SEO_EMAIL_PASS      / SEO_EMAIL_IMAP_HOST      / ...
 *   DESIGN_EMAIL   / DESIGN_EMAIL_PASS   / DESIGN_EMAIL_IMAP_HOST   / ...
 *   CONTENT_EMAIL  / CONTENT_EMAIL_PASS  / CONTENT_EMAIL_IMAP_HOST  / ...
 *   OPS_EMAIL      / OPS_EMAIL_PASS      / OPS_EMAIL_IMAP_HOST      / ...
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

/**
 * Boot the inbox monitor. Gated on ENABLE_INBOX_MONITOR=true so the
 * standard dev server doesn't make IMAP connections by accident.
 *
 * Returns true when started, false when disabled or when no inboxes
 * are configured (so the caller can adjust its own startup log).
 */
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

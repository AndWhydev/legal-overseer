/**
 * Inbox poller.
 *
 * Drives the 2-minute polling cycle across every configured inbox.
 * One tick:
 *   1. Resolve every configured inbox slot from env.
 *   2. For each, open IMAP, fetch UNSEEN, parse, route, reply,
 *      mark \Seen on success.
 *   3. Aggregate counts and log a one-liner per tick.
 *
 * The poller runs inboxes sequentially (rather than in parallel) so
 * we don't open five concurrent IMAP connections to the same provider
 * and trip their per-IP rate limits. Each provider rarely takes more
 * than a few seconds even with dozens of unread messages.
 */

import { createSafeLogger } from '../governance/index.js';
import { fetchUnseenEmails } from './client.js';
import { resolveAllInboxes } from './config.js';
import { routeEmail } from './router.js';

const logger = createSafeLogger('InboxMonitor.Poller');

/** Default poll interval — operator spec asks for "every 2 minutes". */
export const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000;

export interface PollTickResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  perInbox: Array<{
    inboxType: string;
    address: string;
    scanned: number;
    processed: number;
    errors: number;
  }>;
}

/**
 * Run one full poll across every configured inbox.
 */
export async function runPollTick(): Promise<PollTickResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const inboxes = resolveAllInboxes();
  const perInbox: PollTickResult['perInbox'] = [];

  if (inboxes.length === 0) {
    logger.info('Poll tick: no inboxes configured (set <SLUG>_EMAIL + <SLUG>_EMAIL_PASS to enable).');
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      perInbox,
    };
  }

  logger.info(`Poll tick: ${inboxes.length} configured inbox(es)`);
  for (const inbox of inboxes) {
    try {
      const stats = await fetchUnseenEmails(inbox, async (email) => {
        const outcome = await routeEmail(email);
        return { markSeen: outcome.markSeen };
      });
      perInbox.push({
        inboxType: inbox.meta.type,
        address: inbox.address,
        scanned: stats.scanned,
        processed: stats.processed,
        errors: stats.errors,
      });
      logger.info(
        `Inbox ${inbox.meta.type} (${inbox.address}): scanned=${stats.scanned} processed=${stats.processed} errors=${stats.errors}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Inbox ${inbox.meta.type} (${inbox.address}) tick crashed: ${msg}`);
      perInbox.push({
        inboxType: inbox.meta.type,
        address: inbox.address,
        scanned: 0,
        processed: 0,
        errors: 1,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  logger.info(`Poll tick complete in ${durationMs}ms`);
  return { startedAt, finishedAt, durationMs, perInbox };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Start the recurring poll loop. The first tick fires immediately so
 * startup latency isn't `intervalMs` long.
 *
 * Successive ticks are skipped if the previous one hasn't finished —
 * a slow IMAP server can't pile up overlapping poll attempts.
 */
export function startInboxMonitor(intervalMs = DEFAULT_POLL_INTERVAL_MS): void {
  if (intervalHandle) {
    logger.info('Inbox monitor already running');
    return;
  }
  logger.info(`Starting inbox monitor (every ${Math.round(intervalMs / 1000)}s)`);

  const safeTick = async () => {
    if (running) {
      logger.warn('Previous poll tick still running; skipping this interval.');
      return;
    }
    running = true;
    try {
      await runPollTick();
    } catch (err) {
      logger.error(`Poll tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  };

  // Kick off immediately so startup work isn't blocked by the first
  // interval delay.
  void safeTick();

  intervalHandle = setInterval(() => {
    void safeTick();
  }, intervalMs);
}

export function stopInboxMonitor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Inbox monitor stopped');
  }
}

export function isInboxMonitorRunning(): boolean {
  return intervalHandle !== null;
}

/**
 * inbox-monitor.ts — Standalone IMAP polling daemon.
 *
 * Bring up the inbox monitor by itself (no overseer, no task processor).
 * Useful for testing inbox routing in isolation or for running the
 * monitor on a separate process / host from the rest of the daemon.
 *
 * Usage:
 *   npm run inbox:monitor
 *   INBOX_POLL_INTERVAL_MS=30000 npm run inbox:monitor
 *   npm run inbox:monitor -- --once             # run one poll tick and exit
 *   npm run inbox:monitor -- --list             # list configured inboxes
 *
 * Env:
 *   INBOX_POLL_INTERVAL_MS    Poll interval (default 120000 = 2 min)
 *   ENABLE_INBOX_MONITOR      Required ("true") for the long-running daemon.
 *                              The --once and --list flags ignore this gate.
 *
 * Exit codes:
 *   0 success (clean shutdown, or --once tick completed, or --list)
 *   1 fatal error
 *   2 nothing configured (when ENABLE_INBOX_MONITOR=true but no inboxes set)
 */

import { closeDatabase, initializeDatabase } from '../src/db/index.js';
import {
  DEFAULT_POLL_INTERVAL_MS,
  initInboxMonitor,
  resolveAllInboxes,
  runPollTick,
  stopInboxMonitor,
} from '../src/inbox-monitor/index.js';

function ms(envKey: string, def: number): number {
  const raw = process.env[envKey];
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function printList(): void {
  const inboxes = resolveAllInboxes();
  console.log(`Configured inboxes: ${inboxes.length}`);
  if (inboxes.length === 0) {
    console.log(
      'No <SLUG>_EMAIL + <SLUG>_EMAIL_PASS pairs found in env. See .env.example for slot list.',
    );
    return;
  }
  for (const i of inboxes) {
    console.log(
      `  [${i.meta.type.padEnd(8)}] ${i.address.padEnd(40)} imap=${i.imap.host}:${i.imap.port} smtp=${i.smtp.host}:${i.smtp.port}`,
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const runOnce = argv.includes('--once');
  const listOnly = argv.includes('--list');
  const help = argv.includes('--help') || argv.includes('-h');

  if (help) {
    console.log('Usage: npm run inbox:monitor [-- --once | --list]');
    process.exit(0);
  }

  initializeDatabase();

  if (listOnly) {
    printList();
    closeDatabase();
    return;
  }

  if (runOnce) {
    console.log('Running one inbox poll tick...');
    const result = await runPollTick();
    console.log('');
    console.log('=== Poll tick ===');
    console.log(`started:   ${result.startedAt}`);
    console.log(`finished:  ${result.finishedAt}`);
    console.log(`duration:  ${result.durationMs}ms`);
    console.log(`inboxes:   ${result.perInbox.length}`);
    for (const i of result.perInbox) {
      console.log(
        `  [${i.inboxType.padEnd(8)}] ${i.address.padEnd(40)} scanned=${i.scanned} processed=${i.processed} errors=${i.errors}`,
      );
    }
    closeDatabase();
    return;
  }

  const intervalMs = ms('INBOX_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  const started = initInboxMonitor(intervalMs);
  if (!started) {
    console.error(
      'Inbox monitor did not start. Set ENABLE_INBOX_MONITOR=true and configure at least one inbox slot.',
    );
    closeDatabase();
    process.exit(2);
  }

  console.log(`Inbox monitor running (every ${Math.round(intervalMs / 1000)}s). Ctrl-C to stop.`);

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received; shutting down...`);
    stopInboxMonitor();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});

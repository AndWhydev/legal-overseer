/**
 * overseer-start.ts — Long-running overseer daemon
 *
 * Starts both the overseer loop (proactive: walks projects, asks Opus
 * what to do) and the task processor (reactive: drains the pending task
 * queue). They feed each other: overseer enqueues worker tasks, processor
 * picks them up and runs them.
 *
 * Usage:
 *   npx tsx scripts/overseer-start.ts
 *   OVERSEER_INTERVAL_MS=600000 PROCESSOR_INTERVAL_MS=5000 npx tsx scripts/overseer-start.ts
 *
 * Env:
 *   OVERSEER_INTERVAL_MS    Overseer tick interval (default 600000 = 10 min)
 *   PROCESSOR_INTERVAL_MS   Task processor poll interval (default 5000)
 *   DATABASE_PATH           SQLite path override
 *
 * Stop with Ctrl-C. Both loops are shut down gracefully on SIGINT/SIGTERM.
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  startOverseerLoop,
  stopOverseerLoop,
} from '../src/agent/overseer-loop.js';
import { startTaskLoop, stopTaskLoop } from '../src/agent/processor.js';
import {
  initInboxMonitor,
  stopInboxMonitor,
  DEFAULT_POLL_INTERVAL_MS as DEFAULT_INBOX_POLL_MS,
} from '../src/inbox-monitor/index.js';

function ms(envKey: string, def: number): number {
  const raw = process.env[envKey];
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return n;
}

async function main(): Promise<void> {
  initializeDatabase();

  const overseerInterval = ms('OVERSEER_INTERVAL_MS', 10 * 60 * 1000);
  const processorInterval = ms('PROCESSOR_INTERVAL_MS', 5000);
  const inboxInterval = ms('INBOX_POLL_INTERVAL_MS', DEFAULT_INBOX_POLL_MS);

  console.log('Starting overseer daemon');
  console.log(`  overseer tick:     every ${Math.round(overseerInterval / 1000)}s`);
  console.log(`  processor poll:    every ${Math.round(processorInterval / 1000)}s`);
  console.log(`  inbox poll:        every ${Math.round(inboxInterval / 1000)}s (when ENABLE_INBOX_MONITOR=true)`);

  startTaskLoop(processorInterval);
  startOverseerLoop(overseerInterval);
  const inboxStarted = initInboxMonitor(inboxInterval);

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received; shutting down...`);
    if (inboxStarted) stopInboxMonitor();
    stopOverseerLoop();
    stopTaskLoop();
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

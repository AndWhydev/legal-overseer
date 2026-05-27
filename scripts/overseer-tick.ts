/**
 * overseer-tick.ts — Run one overseer tick.
 *
 * Walks every open matter and enqueues reminder tasks for any
 * deadline due within 14 days that hasn't been reminded yet.
 *
 * Usage:
 *   npx tsx scripts/overseer-tick.ts
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import { runOverseerTick } from '../src/agent/overseer-loop.js';
import { dispatchIntakeFollowUps } from '../src/intake/client-questionnaire/index.js';

async function main(): Promise<void> {
  initializeDatabase();
  const start = Date.now();
  const result = runOverseerTick();
  // Sweep stale client-intake sessions: 24h reminder, 48h abandonment.
  const intake = await dispatchIntakeFollowUps();
  const ms = Date.now() - start;
  console.log(`Overseer tick complete in ${ms}ms`);
  console.log(`Reminders dispatched: ${result.remindersDispatched}`);
  console.log(`Intake reminders: ${intake.remindersSent}, abandoned: ${intake.abandoned}`);
  closeDatabase();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

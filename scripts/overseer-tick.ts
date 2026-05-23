/**
 * overseer-tick.ts — Run one overseer tick across all active projects
 *
 * The overseer snapshots each active project, asks Opus what the next
 * worker cycle should do (or wait, or escalate), and prints a per-project
 * summary. Worker tasks chosen by the overseer are enqueued in the tasks
 * table — they execute the next time the processor picks them up.
 *
 * Usage:
 *   npx tsx scripts/overseer-tick.ts
 *
 * Exit codes:
 *   0  tick completed (possibly with per-project errors logged)
 *   1  tick crashed wholesale
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import { runOverseerTick } from '../src/agent/overseer-loop.js';

async function main(): Promise<void> {
  initializeDatabase();

  const result = await runOverseerTick();

  console.log('');
  console.log('=== Overseer tick ===');
  console.log(`started:  ${result.startedAt}`);
  console.log(`finished: ${result.finishedAt}`);
  console.log(`duration: ${result.durationMs}ms`);
  console.log(`projects: ${result.ticks.length}`);
  console.log('');

  for (const t of result.ticks) {
    const head = `[${t.projectName}] ${t.decision.action}`;
    if (t.decision.action === 'dispatch') {
      console.log(`${head} → task=${t.enqueuedTaskId}`);
      console.log(`  prompt: ${t.decision.prompt.slice(0, 160).replace(/\n/g, ' ')}`);
      console.log(`  why:    ${t.decision.reasoning.slice(0, 160).replace(/\n/g, ' ')}`);
    } else {
      const reason = 'reason' in t.decision ? t.decision.reason : '';
      console.log(`${head} — ${reason.slice(0, 200).replace(/\n/g, ' ')}`);
    }
    if (t.error) console.log(`  error:  ${t.error}`);
  }

  closeDatabase();
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});

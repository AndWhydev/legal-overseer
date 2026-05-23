/**
 * dashboard.ts — Launch the local CTO dashboard.
 *
 * Read-only HTTP UI on 127.0.0.1:$DASHBOARD_PORT (default 3000) that
 * shows the overseer fleet, per-project status, recent tasks, and
 * lessons learned.
 *
 * Usage:
 *   npx tsx scripts/dashboard.ts                 # listen on 3000
 *   DASHBOARD_PORT=4000 npx tsx scripts/dashboard.ts
 *
 * Stop with Ctrl-C.
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import { startDashboard } from '../src/dashboard/server.js';

async function main(): Promise<void> {
  initializeDatabase();

  const server = await startDashboard();
  console.log(`Dashboard ready: ${server.url}`);
  console.log('Routes:');
  console.log(`  ${server.url}/                 — fleet view`);
  console.log(`  ${server.url}/project/<id>     — per-project deep view`);
  console.log(`  ${server.url}/task/<id>        — task input/output`);
  console.log(`  ${server.url}/api/fleet.json   — JSON fleet summary`);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received; shutting down...`);
    await server.stop();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});

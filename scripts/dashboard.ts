/**
 * dashboard.ts — Launch the local Legal Overseer dashboard.
 *
 * HTTP UI on 127.0.0.1:$DASHBOARD_PORT (default 3000) showing matters,
 * review queue, deadline calendar, and billing tracker.
 *
 * Usage:
 *   npx tsx scripts/dashboard.ts                 # listen on 3000
 *   DASHBOARD_PORT=4000 npx tsx scripts/dashboard.ts
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import { startDashboard } from '../src/dashboard/server.js';

async function main(): Promise<void> {
  initializeDatabase();

  const server = await startDashboard();
  console.log(`Dashboard ready: ${server.url}`);
  console.log('Routes:');
  console.log(`  ${server.url}/                  — matter list`);
  console.log(`  ${server.url}/matter/<id>       — matter detail`);
  console.log(`  ${server.url}/review            — review queue`);
  console.log(`  ${server.url}/review/<id>       — review detail (approve/reject)`);
  console.log(`  ${server.url}/calendar          — deadline calendar`);
  console.log(`  ${server.url}/billing           — billing tracker`);
  console.log(`  ${server.url}/api/matters.json  — JSON matter summary`);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received; shutting down...`);
    await server.stop();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

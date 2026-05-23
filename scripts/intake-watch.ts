/**
 * intake-watch.ts — Run the scope-intake inbox watcher.
 *
 * Watches ~/inbox for new .md / .docx scope documents. Each new file
 * is parsed with Opus, scaffolded into a fresh project under
 * /mnt/c/Users/andy/Desktop/Projects/<slug>, registered in the projects
 * repo, archived into ~/inbox/.processed/, and confirmed via email to
 * andy@allwebbedup.com.au.
 *
 * Usage:
 *   npx tsx scripts/intake-watch.ts
 *
 * Env overrides:
 *   INBOX_DIR        Directory to watch (default ~/inbox)
 *   PROJECTS_ROOT    Where to scaffold new project folders
 *                    (default /mnt/c/Users/andy/Desktop/Projects)
 *
 * Stop with Ctrl-C. The watcher cleans up its fs.watch handle on
 * SIGINT / SIGTERM.
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  startInboxWatcher,
  ensureInboxDir,
  DEFAULT_PROJECTS_ROOT,
  INTAKE_NOTIFY_TO,
} from '../src/intake/index.js';
import { isEmailConfigured } from '../src/email/notifier.js';

function main(): void {
  initializeDatabase();

  const inboxDir = ensureInboxDir();
  const projectsRoot = process.env.PROJECTS_ROOT ?? DEFAULT_PROJECTS_ROOT;

  console.log('BitBit Scope Intake — inbox watcher');
  console.log(`  watching:        ${inboxDir}`);
  console.log(`  scaffolding to:  ${projectsRoot}`);
  console.log(`  confirming to:   ${INTAKE_NOTIFY_TO}`);
  console.log(`  email channel:   ${isEmailConfigured() ? 'configured' : 'NOT configured (intake will still run, but confirmations won’t send)'}`);
  console.log('  drop .md or .docx scope docs into the inbox and the overseer will scaffold them.');
  console.log('');
  console.log('  Press Ctrl-C to stop.');

  const watcher = startInboxWatcher({
    projectsRoot,
    notifyTo: INTAKE_NOTIFY_TO,
    onProcessed: (path, error) => {
      if (error) {
        console.error(`  ✗ ${path}\n      ${error.message}`);
      } else {
        console.log(`  ✓ ${path}`);
      }
    },
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received; stopping watcher...`);
    watcher.stop();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (err) {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
}

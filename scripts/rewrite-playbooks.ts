/**
 * rewrite-playbooks.ts — Rewrite PLAYBOOK.md for all active projects
 *
 * Run weekly (or after a burst of new lessons) to consolidate the
 * project's accumulated lessons into a concise PLAYBOOK.md that lives
 * next to CLAUDE.md and is read by every worker cycle.
 *
 * Usage:
 *   npx tsx scripts/rewrite-playbooks.ts                  # all active projects
 *   npx tsx scripts/rewrite-playbooks.ts --project Gadget # one project
 *   npx tsx scripts/rewrite-playbooks.ts --min-lessons 5  # require N lessons
 *
 * Exit codes:
 *   0  success (possibly with per-project skips)
 *   1  fatal error
 */

import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  getActiveProjects,
  getProjectByName,
  getProjectById,
} from '../src/db/repositories/projects.js';
import { rewriteProjectPlaybook } from '../src/memory/playbook.js';

interface CliArgs {
  project?: string;
  minLessons: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { minLessons: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') {
      args.project = argv[++i];
    } else if (a === '--min-lessons') {
      const n = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(n) || n < 1) {
        console.error('Error: --min-lessons must be a positive integer');
        process.exit(2);
      }
      args.minLessons = n;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: tsx scripts/rewrite-playbooks.ts [--project <name|id>] [--min-lessons N]');
      process.exit(0);
    } else {
      console.error(`Error: unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  initializeDatabase();

  const targets = args.project
    ? (() => {
        const p = getProjectById(args.project!) ?? getProjectByName(args.project!);
        if (!p) {
          console.error(`Error: no project matching "${args.project}"`);
          process.exit(2);
        }
        return [p];
      })()
    : getActiveProjects();

  console.log(`Rewriting playbooks for ${targets.length} project(s) (min lessons=${args.minLessons})\n`);

  for (const project of targets) {
    process.stdout.write(`[${project.name}] `);
    const r = await rewriteProjectPlaybook(project.id, args.minLessons);
    if (r.written) {
      console.log(`✓ wrote ${r.path} (${r.newLength} chars from ${r.lessonsConsidered} lessons${r.costUsd !== undefined ? `, $${r.costUsd.toFixed(4)}` : ''})`);
    } else if (r.error) {
      console.log(`✗ ${r.error}`);
    } else {
      console.log(`- skipped (${r.skipReason})`);
    }
  }

  closeDatabase();
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});

/**
 * register-projects.ts — Project registry seeder for the BitBit overseer
 *
 * Walks a parent directory, finds every subfolder containing a CLAUDE.md,
 * and registers them in the projects table. Also supports a list mode that
 * just prints what the overseer currently knows about.
 *
 * Usage:
 *   npx tsx scripts/register-projects.ts                  # register (defaults below)
 *   npx tsx scripts/register-projects.ts --list           # just list known projects
 *   npx tsx scripts/register-projects.ts --parent /path   # scan this dir
 *   npx tsx scripts/register-projects.ts --depth 3        # walk N levels deep
 *   npx tsx scripts/register-projects.ts --dry-run        # show what would be added
 *
 * Defaults:
 *   --parent : the parent directory of process.cwd() (e.g. /home/andy when
 *              run from /home/andy/Gadget)
 *   --depth  : 3 (parent + 2 levels of nesting)
 *
 * Env:
 *   DATABASE_PATH : optional SQLite path override (defaults to
 *                   ./data/bitbit.db for development)
 *
 * Exit codes:
 *   0  success
 *   1  one or more directories failed to register
 *   2  bad arguments
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename, relative } from 'node:path';
import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  createProject,
  getAllProjects,
  getProjectByPath,
  type Project,
} from '../src/db/repositories/projects.js';

interface CliArgs {
  parent: string;
  depth: number;
  list: boolean;
  dryRun: boolean;
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  '.fly',
  '.vercel',
  '.expo',
  'coverage',
]);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    parent: resolve(process.cwd(), '..'),
    depth: 3,
    list: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--parent') {
      const next = argv[++i];
      if (!next) {
        console.error('Error: --parent requires a path');
        process.exit(2);
      }
      args.parent = resolve(next);
    } else if (a === '--depth') {
      const next = argv[++i];
      const n = Number.parseInt(next ?? '', 10);
      if (!Number.isFinite(n) || n < 1) {
        console.error('Error: --depth requires a positive integer');
        process.exit(2);
      }
      args.depth = n;
    } else if (a === '--list') {
      args.list = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Error: unknown argument: ${a}`);
      printUsage();
      process.exit(2);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`Usage: register-projects.ts [options]

Options:
  --parent <path>   Parent directory to scan (default: parent of cwd)
  --depth <n>       How many directory levels to walk (default: 3)
  --list            Skip discovery; just print registered projects
  --dry-run         Print what would be registered without writing
  -h, --help        Show this help`);
}

/**
 * Recursively walk a directory looking for folders that contain a CLAUDE.md.
 * Stops descending into a folder once it finds a CLAUDE.md there (we treat
 * that folder as the project root and don't register nested CLAUDE.mds).
 */
function findProjectsWithClaudeMd(root: string, maxDepth: number): string[] {
  const found: string[] = [];

  const walk = (dir: string, depthLeft: number): void => {
    if (depthLeft < 0) return;
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    // If THIS directory contains a CLAUDE.md, register it and stop descending.
    if (entries.includes('CLAUDE.md')) {
      found.push(dir);
      return;
    }

    if (depthLeft === 0) return;

    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.') continue;
      if (SKIP_DIRS.has(entry)) continue;

      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        walk(full, depthLeft - 1);
      }
    }
  };

  walk(root, maxDepth);
  return found;
}

function formatProjectRow(p: Project, parent: string): string {
  const displayPath = p.path.startsWith(parent)
    ? relative(parent, p.path) || basename(p.path)
    : p.path;
  const tier = p.model_tier_override ?? 'default';
  const activity = p.last_activity_at ?? 'never';
  return [
    `  ${p.name.padEnd(28)}`,
    `prio=${String(p.priority).padStart(3)}`,
    `status=${p.status.padEnd(8)}`,
    `tier=${tier.padEnd(7)}`,
    `last=${activity.padEnd(25)}`,
    displayPath,
  ].join(' ');
}

function listProjects(parent: string): void {
  const all = getAllProjects();
  if (all.length === 0) {
    console.log('No projects registered yet.');
    console.log('Run without --list to seed from a parent directory.');
    return;
  }

  console.log(`Registered projects (${all.length}):`);
  for (const p of all) {
    console.log(formatProjectRow(p, parent));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('BitBit Project Registry');
  console.log('=======================\n');

  initializeDatabase();

  if (args.list) {
    listProjects(args.parent);
    closeDatabase();
    return;
  }

  console.log(`Scanning ${args.parent} (depth=${args.depth})...\n`);

  if (!existsSync(args.parent)) {
    console.error(`Error: parent directory does not exist: ${args.parent}`);
    closeDatabase();
    process.exit(2);
  }

  const dirs = findProjectsWithClaudeMd(args.parent, args.depth);

  if (dirs.length === 0) {
    console.log('No directories with CLAUDE.md found.');
    closeDatabase();
    return;
  }

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  for (const dir of dirs) {
    const existing = getProjectByPath(dir);
    const claudeMdPath = join(dir, 'CLAUDE.md');
    const name = basename(dir);

    if (existing) {
      console.log(`SKIP  ${name.padEnd(28)} already registered  (${dir})`);
      skipped++;
      continue;
    }

    if (args.dryRun) {
      console.log(`DRY   ${name.padEnd(28)} would register      (${dir})`);
      registered++;
      continue;
    }

    try {
      const project = createProject({
        name,
        path: dir,
        claude_md_path: claudeMdPath,
      });
      console.log(`ADD   ${name.padEnd(28)} id=${project.id}`);
      registered++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FAIL  ${name.padEnd(28)} ${msg}`);
      failed++;
    }
  }

  console.log('');
  console.log(
    `Done. ${args.dryRun ? 'would add' : 'added'}=${registered}, ` +
      `skipped=${skipped}, failed=${failed}`
  );

  if (!args.dryRun && registered > 0) {
    console.log('');
    listProjects(args.parent);
  }

  closeDatabase();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  closeDatabase();
  process.exit(1);
});

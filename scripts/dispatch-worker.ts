/**
 * dispatch-worker.ts — Manually dispatch a Claude Code worker
 *
 * Spawns a headless `claude -p` invocation against one registered
 * project, streams its output, and prints a summary. This is the Stage 2
 * deliverable: a single end-to-end worker run that you can drive by hand
 * before the overseer loop takes over.
 *
 * Usage:
 *   npx tsx scripts/dispatch-worker.ts --project <name|id> --prompt "..."
 *   npx tsx scripts/dispatch-worker.ts --project Gadget --prompt "run tests and report failures"
 *   npx tsx scripts/dispatch-worker.ts --project Gadget --prompt-file ./prompt.md
 *   npx tsx scripts/dispatch-worker.ts --project Gadget --prompt "..." --model haiku
 *
 * Optional flags:
 *   --model haiku|sonnet|opus     Override the model tier
 *   --budget 1.5                  Max budget USD
 *   --timeout 600000              Worker timeout in ms (default 30 min)
 *   --tools Read,Edit,Grep        Override allowed tools (comma-separated)
 *   --through-processor           Instead of running inline, insert a task
 *                                  row and let the processor pick it up
 *                                  (validates the full classifier+routing path)
 *
 * Exit codes:
 *   0  success
 *   1  worker failed (non-zero exit, error, timeout)
 *   2  bad arguments
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import {
  getProjectById,
  getProjectByName,
} from '../src/db/repositories/projects.js';
import { createTask } from '../src/db/repositories/tasks.js';
import { runClaudeCodeWorker } from '../src/skills/claude-code-worker/index.js';
import type { ModelTier } from '../src/skills/types.js';

interface CliArgs {
  project: string;
  prompt: string;
  model?: ModelTier;
  budget?: number;
  timeout?: number;
  tools?: string[];
  throughProcessor: boolean;
}

function printUsage(): void {
  console.log(
    `Usage:\n  npx tsx scripts/dispatch-worker.ts --project <name|id> --prompt "..."\n` +
      `Optional: --model haiku|sonnet|opus --budget 1.5 --timeout 600000 --tools Read,Edit,Grep --through-processor`
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { throughProcessor: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') {
      args.project = argv[++i];
    } else if (a === '--prompt') {
      args.prompt = argv[++i];
    } else if (a === '--prompt-file') {
      const path = resolve(argv[++i] ?? '');
      if (!existsSync(path)) {
        console.error(`Error: prompt file not found: ${path}`);
        process.exit(2);
      }
      args.prompt = readFileSync(path, 'utf8');
    } else if (a === '--model') {
      const v = argv[++i];
      if (v !== 'haiku' && v !== 'sonnet' && v !== 'opus') {
        console.error(`Error: --model must be one of haiku|sonnet|opus`);
        process.exit(2);
      }
      args.model = v;
    } else if (a === '--budget') {
      args.budget = Number.parseFloat(argv[++i] ?? '');
      if (!Number.isFinite(args.budget) || args.budget <= 0) {
        console.error(`Error: --budget must be a positive number`);
        process.exit(2);
      }
    } else if (a === '--timeout') {
      args.timeout = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isFinite(args.timeout) || args.timeout <= 0) {
        console.error(`Error: --timeout must be a positive integer (ms)`);
        process.exit(2);
      }
    } else if (a === '--tools') {
      args.tools = (argv[++i] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    } else if (a === '--through-processor') {
      args.throughProcessor = true;
    } else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Error: unknown argument: ${a}`);
      printUsage();
      process.exit(2);
    }
  }

  if (!args.project || !args.prompt) {
    console.error('Error: --project and --prompt (or --prompt-file) are required');
    printUsage();
    process.exit(2);
  }

  return args as CliArgs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  initializeDatabase();

  // Resolve project by id or name.
  const project = getProjectById(args.project) ?? getProjectByName(args.project);
  if (!project) {
    console.error(`Error: no project found matching "${args.project}"`);
    console.error('Run `npm run projects:list` to see registered projects.');
    closeDatabase();
    process.exit(2);
  }

  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Path:    ${project.path}`);
  console.log(`Prompt:  ${args.prompt.split('\n')[0].slice(0, 80)}${args.prompt.length > 80 ? '…' : ''}`);

  if (args.throughProcessor) {
    // Drop a row in the tasks table and let the running processor pick it
    // up. Useful for validating the classifier+routing path. Caller is
    // responsible for having `npm run start` (or equivalent) running.
    const inputJson = JSON.stringify({
      project_id: project.id,
      prompt: args.prompt,
      model_tier: args.model,
      max_budget_usd: args.budget,
      timeout_ms: args.timeout,
      allowed_tools: args.tools,
    });
    const task = createTask('claude_code_worker', 'cli', inputJson, undefined, project.id);
    console.log(`Task queued: ${task.id} (will be picked up by the running processor)`);
    closeDatabase();
    return;
  }

  const result = await runClaudeCodeWorker({
    project_id: project.id,
    prompt: args.prompt,
    model_tier: args.model,
    max_budget_usd: args.budget,
    timeout_ms: args.timeout,
    allowed_tools: args.tools,
  });

  console.log('');
  console.log('=== Worker result ===');
  console.log(`success:    ${result.success}`);
  console.log(`exitCode:   ${result.exitCode}`);
  console.log(`model:      ${result.modelTier}`);
  console.log(`durationMs: ${result.durationMs}`);
  if (result.costUsd !== undefined) {
    console.log(`costUsd:    $${result.costUsd.toFixed(4)}`);
  }
  if (result.toolCalls.length > 0) {
    console.log(`toolCalls:  ${result.toolCalls.join(', ')}`);
  }
  if (result.error) {
    console.log(`error:      ${result.error}`);
  }
  console.log('');
  console.log('--- output ---');
  console.log(result.output);
  if (result.stderr.trim() && !result.success) {
    console.log('--- stderr ---');
    console.log(result.stderr);
  }

  closeDatabase();
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  closeDatabase();
  process.exit(1);
});

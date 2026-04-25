/**
 * benchmark_run.ts - BitBit benchmark runner wrapper
 *
 * Reads a markdown task file, enqueues it through BitBit's SQLite task queue
 * via createTask(), drives processNextTask() directly until the task reaches
 * a terminal state, then writes the result artefacts to --capture-dir.
 *
 * Usage:
 *   npx tsx scripts/benchmark_run.ts --task-file <path> --capture-dir <path>
 *
 * Env:
 *   ANTHROPIC_API_KEY   required (same as the normal task processor)
 *   DATABASE_PATH       optional; recommended per-run isolated path for benchmarks
 *                       (e.g. ./data/benchmark-<timestamp>.db)
 *   BENCHMARK_TIMEOUT_MS optional; hard wall-clock cap (default 600000 = 10 min)
 *
 * Outputs in --capture-dir:
 *   output.md     Final agent output (the `output` field of task.output_json)
 *   trace.log     Tool calls from output_json.toolCalls (one per line), or empty
 *   task_id.txt   The SQLite task id (UUID)
 *
 * Exit codes:
 *   0  task completed successfully
 *   1  task completed but BitBit marked it failed
 *   2  wrapper failure (args, IO, API error, timeout, etc.)
 *
 * IMPORTANT: processNextTask() picks up the OLDEST pending task. For clean
 * benchmark isolation, point DATABASE_PATH at a fresh per-run DB.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { initializeDatabase, closeDatabase } from '../src/db/index.js';
import { createTask, getById } from '../src/db/repositories/tasks.js';
import { processNextTask } from '../src/agent/processor.js';

interface CliArgs {
  taskFile: string;
  captureDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task-file') {
      args.taskFile = argv[++i];
    } else if (a === '--capture-dir') {
      args.captureDir = argv[++i];
    } else if (a === '--help' || a === '-h') {
      printUsageAndExit(0);
    }
  }
  if (!args.taskFile || !args.captureDir) {
    console.error('Error: --task-file and --capture-dir are both required');
    printUsageAndExit(2);
  }
  return args as CliArgs;
}

function printUsageAndExit(code: number): never {
  const msg =
    'Usage: npx tsx scripts/benchmark_run.ts --task-file <path> --capture-dir <path>\n';
  if (code === 0) {
    process.stdout.write(msg);
  } else {
    process.stderr.write(msg);
  }
  process.exit(code);
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function writeArtefacts(
  captureDir: string,
  taskId: string,
  output: string,
  toolCalls: string[]
): void {
  ensureDir(captureDir);
  writeFileSync(resolve(captureDir, 'task_id.txt'), taskId + '\n', 'utf8');
  writeFileSync(resolve(captureDir, 'output.md'), output, 'utf8');
  writeFileSync(
    resolve(captureDir, 'trace.log'),
    toolCalls.length > 0 ? toolCalls.join('\n') + '\n' : '',
    'utf8'
  );
}

async function main(): Promise<void> {
  const { taskFile, captureDir } = parseArgs(process.argv.slice(2));

  const taskPath = resolve(taskFile);
  if (!existsSync(taskPath)) {
    console.error(`Error: task file not found: ${taskPath}`);
    process.exit(2);
  }
  const capturePath = resolve(captureDir);
  ensureDir(capturePath);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: ANTHROPIC_API_KEY is required (BitBit processor needs it for Haiku classification and skill execution)'
    );
    process.exit(2);
  }

  const taskContent = readFileSync(taskPath, 'utf8');
  if (!taskContent.trim()) {
    console.error(`Error: task file is empty: ${taskPath}`);
    process.exit(2);
  }

  const timeoutMs = parseInt(process.env.BENCHMARK_TIMEOUT_MS || '600000', 10);
  const deadline = Date.now() + timeoutMs;

  console.log(`[benchmark] task-file: ${taskPath}`);
  console.log(`[benchmark] capture-dir: ${capturePath}`);
  console.log(
    `[benchmark] DATABASE_PATH: ${process.env.DATABASE_PATH || '(default ./data/bitbit.db)'}`
  );
  console.log(`[benchmark] timeout: ${timeoutMs}ms`);

  // 1. Initialize DB
  try {
    initializeDatabase();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: initializeDatabase failed: ${msg}`);
    process.exit(2);
  }

  // 2. Enqueue the task.
  //    skill_id='general' lets the coordinator classify freely via Haiku.
  //    source='benchmark' is just a log tag.
  //    input_json matches the shape processor.ts reads at line 88-89:
  //      { prompt: <task markdown> }
  const inputJson = JSON.stringify({ prompt: taskContent });
  const task = createTask('general', 'benchmark', inputJson);
  console.log(`[benchmark] task created: ${task.id}`);

  // Write task_id.txt early so the caller can observe the id even on failure.
  writeFileSync(resolve(capturePath, 'task_id.txt'), task.id + '\n', 'utf8');

  // 3. Drive processNextTask() until our task reaches a terminal state.
  //    processNextTask picks up the oldest pending task; if others exist
  //    it will run them first. For isolation, use a fresh DATABASE_PATH.
  let iterations = 0;
  try {
    while (Date.now() < deadline) {
      const current = getById(task.id);
      if (!current) {
        console.error(`Error: task ${task.id} disappeared from DB`);
        closeDatabase();
        process.exit(2);
      }
      if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
        break;
      }
      // Pump one task (may be ours, may be an older pending task in the DB).
      const processed = await processNextTask();
      iterations++;
      if (!processed) {
        // No pending tasks AND our task isn't in terminal state — this means
        // our task is stuck in 'running' or 'awaiting_approval'. Wait briefly.
        if (current.status === 'awaiting_approval') {
          console.error(
            `Error: task ${task.id} is awaiting_approval; benchmark runner does not auto-approve`
          );
          closeDatabase();
          process.exit(2);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (iterations > 1000) {
        console.error(`Error: aborting after ${iterations} iterations without terminal state`);
        closeDatabase();
        process.exit(2);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: processNextTask threw: ${msg}`);
    closeDatabase();
    process.exit(2);
  }

  // 4. Read final task state and write artefacts.
  const final = getById(task.id);
  if (!final) {
    console.error(`Error: task ${task.id} vanished before final read`);
    closeDatabase();
    process.exit(2);
  }

  if (final.status === 'pending' || final.status === 'running' || final.status === 'awaiting_approval') {
    console.error(
      `Error: timeout (${timeoutMs}ms) reached; task ${task.id} still ${final.status}`
    );
    writeArtefacts(
      capturePath,
      task.id,
      `# BENCHMARK TIMEOUT\n\nTask ${task.id} did not reach terminal state within ${timeoutMs}ms.\nFinal status: ${final.status}\n`,
      []
    );
    closeDatabase();
    process.exit(2);
  }

  // Parse output_json shape from processor.ts:183-192:
  //   { output: string, toolCalls: string[], costUsd?: number, classification: {...} }
  let output = '';
  let toolCalls: string[] = [];
  if (final.output_json) {
    try {
      const parsed = JSON.parse(final.output_json) as {
        output?: string;
        toolCalls?: string[];
      };
      output = typeof parsed.output === 'string' ? parsed.output : final.output_json;
      toolCalls = Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [];
    } catch {
      output = final.output_json;
    }
  } else if (final.status === 'failed') {
    output = `# TASK FAILED\n\n${final.error_message || '(no error message)'}\n`;
  } else {
    output = '(no output)';
  }

  writeArtefacts(capturePath, task.id, output, toolCalls);

  closeDatabase();

  if (final.status === 'completed') {
    console.log(`[benchmark] task ${task.id} completed`);
    process.exit(0);
  } else {
    console.log(`[benchmark] task ${task.id} ${final.status}: ${final.error_message || ''}`);
    process.exit(1);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(2);
});

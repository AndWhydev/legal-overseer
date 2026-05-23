/**
 * Claude Code Worker skill
 *
 * Dispatches a headless `claude -p` invocation into a registered
 * project directory. Output is captured and persisted as the task's
 * output_json so the overseer can inspect or replay it.
 *
 * See worker.ts for the actual spawn logic and types.ts for the
 * input/output contract.
 */

export { runClaudeCodeWorker } from './worker.js';
export type {
  ClaudeCodeWorkerInput,
  ClaudeCodeWorkerResult,
} from './types.js';

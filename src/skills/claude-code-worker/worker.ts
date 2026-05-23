/**
 * Headless Claude Code worker.
 *
 * Spawns `claude -p` as a subprocess in a project's directory, streams its
 * output, and returns a structured result. The project's CLAUDE.md (if
 * present at the project's path) is loaded automatically by Claude Code
 * itself, so we just need to set cwd correctly.
 *
 * Permissions are scoped via --allowedTools. We never pass
 * --dangerously-skip-permissions; workers run with the user's normal
 * permission boundaries, scoped further to the project directory.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createSafeLogger } from '../../governance/index.js';
import { getSkillDefinition } from '../registry.js';
import { getProjectById, touchActivity } from '../../db/repositories/projects.js';
import type { ModelTier } from '../types.js';
import type { ClaudeCodeWorkerInput, ClaudeCodeWorkerResult } from './types.js';

const logger = createSafeLogger('ClaudeCodeWorker');

/**
 * Default timeout for a single worker invocation. 30 minutes is generous
 * but matches how long a complex multi-step task can run.
 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Map skill model tier names to the model arg `claude` accepts.
 * Keep in sync with src/agent/models.ts MODELS map.
 */
const MODEL_ARG: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
  opus: 'claude-opus-4-5',
};

/**
 * Default allowlist for workers. This is restrictive on purpose; tasks
 * that need more (e.g., network access) should override via input.
 *
 * Edit/Write are included because the whole point of dispatching a worker
 * is to let it modify the project. Bash is included but the worker is
 * cwd-scoped to the project directory so blast radius is bounded.
 */
const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
];

/**
 * Resolve the model tier to actually use for a project, given the input
 * override, the project's override, and the skill default.
 */
function resolveModelTier(
  inputTier: ModelTier | undefined,
  projectOverride: ModelTier | null,
  defaultTier: ModelTier
): ModelTier {
  return inputTier ?? projectOverride ?? defaultTier;
}

/**
 * Try to extract structured signals (cost, tool names) from a JSONL
 * stream line emitted by `claude -p --output-format stream-json`.
 *
 * The format is documented as one JSON object per line. We tolerate
 * malformed lines silently — the worker's primary signal is exit code +
 * stdout text.
 */
interface StreamSignals {
  costUsd?: number;
  toolNames: string[];
  finalText?: string;
}

function extractStreamSignals(lines: string[]): StreamSignals {
  const signals: StreamSignals = { toolNames: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (typeof obj !== 'object' || obj === null) continue;
    const rec = obj as Record<string, unknown>;

    // Result line: { type: 'result', total_cost_usd, result }
    if (rec.type === 'result') {
      if (typeof rec.total_cost_usd === 'number') {
        signals.costUsd = rec.total_cost_usd;
      }
      if (typeof rec.result === 'string') {
        signals.finalText = rec.result;
      }
      continue;
    }

    // Assistant turn carrying a tool_use content block
    if (rec.type === 'assistant' && typeof rec.message === 'object' && rec.message !== null) {
      const msg = rec.message as { content?: unknown };
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (
            typeof block === 'object' &&
            block !== null &&
            (block as Record<string, unknown>).type === 'tool_use'
          ) {
            const name = (block as Record<string, unknown>).name;
            if (typeof name === 'string' && !signals.toolNames.includes(name)) {
              signals.toolNames.push(name);
            }
          }
        }
      }
    }
  }

  return signals;
}

/**
 * Run a headless Claude Code worker for a project.
 *
 * @param input - What to do, where, and with what budget
 * @returns Structured result including cost, exit code, and output
 */
export async function runClaudeCodeWorker(
  input: ClaudeCodeWorkerInput
): Promise<ClaudeCodeWorkerResult> {
  const skill = getSkillDefinition('claude_code_worker');
  const project = getProjectById(input.project_id);

  if (!project) {
    return {
      success: false,
      output: '',
      stderr: '',
      exitCode: null,
      toolCalls: [],
      durationMs: 0,
      modelTier: skill.defaultModel,
      projectId: input.project_id,
      projectPath: '',
      error: `Project not found: ${input.project_id}`,
    };
  }

  if (!existsSync(project.path)) {
    return {
      success: false,
      output: '',
      stderr: '',
      exitCode: null,
      toolCalls: [],
      durationMs: 0,
      modelTier: skill.defaultModel,
      projectId: project.id,
      projectPath: project.path,
      error: `Project directory does not exist: ${project.path}`,
    };
  }

  const modelTier = resolveModelTier(
    input.model_tier,
    project.model_tier_override,
    skill.defaultModel
  );
  const allowedTools = input.allowed_tools ?? DEFAULT_ALLOWED_TOOLS;
  const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  // Compose the prompt: skill system prompt + project hint + extra context + user prompt.
  // CLAUDE.md at the project path is loaded automatically by claude itself.
  const promptParts: string[] = [skill.systemPrompt];
  promptParts.push(
    `\n---\nProject: ${project.name}\nWorking directory: ${project.path}`
  );
  if (input.extra_context) {
    promptParts.push(`\n---\nAdditional context:\n${input.extra_context}`);
  }
  promptParts.push(`\n---\nTask:\n${input.prompt}`);
  const fullPrompt = promptParts.join('\n');

  const args = [
    '-p',
    fullPrompt,
    '--model',
    MODEL_ARG[modelTier],
    '--output-format',
    'stream-json',
    '--verbose',
    '--allowedTools',
    allowedTools.join(','),
  ];

  logger.info(
    `Dispatching worker for project ${project.name} (${project.id})`,
    { model: modelTier, allowedTools: allowedTools.length, timeoutMs }
  );

  const startTime = Date.now();
  touchActivity(project.id);

  return await new Promise<ClaudeCodeWorkerResult>((resolve) => {
    const child = spawn('claude', args, {
      cwd: project.path,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let killedByTimeout = false;

    const timeout = setTimeout(() => {
      killedByTimeout = true;
      logger.warn(`Worker timed out after ${timeoutMs}ms; killing`, {
        projectId: project.id,
      });
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      logger.error(`Failed to spawn claude: ${err.message}`);
      resolve({
        success: false,
        output: stdoutChunks.join(''),
        stderr: stderrChunks.join('') + `\nspawn error: ${err.message}`,
        exitCode: null,
        toolCalls: [],
        durationMs,
        modelTier,
        projectId: project.id,
        projectPath: project.path,
        error: `Failed to spawn claude binary: ${err.message}. Is Claude Code installed?`,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');

      const lines = stdout.split('\n');
      const signals = extractStreamSignals(lines);
      const output = signals.finalText ?? stdout;
      const success = code === 0 && !killedByTimeout;

      logger.info(
        `Worker completed for project ${project.name}`,
        {
          exitCode: code,
          durationMs,
          costUsd: signals.costUsd,
          toolCount: signals.toolNames.length,
        }
      );

      resolve({
        success,
        output,
        stderr,
        exitCode: code,
        costUsd: signals.costUsd,
        toolCalls: signals.toolNames,
        durationMs,
        modelTier,
        projectId: project.id,
        projectPath: project.path,
        error: killedByTimeout
          ? `Worker timed out after ${timeoutMs}ms`
          : success
            ? undefined
            : `claude exited with code ${code}`,
      });
    });
  });
}

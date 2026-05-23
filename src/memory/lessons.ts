/**
 * Lesson generation and recall.
 *
 * After a worker task completes, generateLessonFromTask asks Opus to
 * distill "what worked / what didn't" into a single structured lesson.
 * That lesson is persisted via the lessons repo and becomes context
 * for future worker dispatches.
 *
 * Recall is straightforward keyword search over the project's lessons,
 * formatted as a short bullet list the worker prompt can prepend.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { MODELS } from '../agent/models.js';
import { createSafeLogger } from '../governance/index.js';
import {
  createLesson,
  getRelevantLessons,
  type Lesson,
  type LessonOutcome,
} from '../db/repositories/lessons.js';
import { getById as getTaskById } from '../db/repositories/tasks.js';

const logger = createSafeLogger('Memory');

/**
 * Lesson budget. Generation is one round-trip Opus call, gated on cost.
 */
const LESSON_BUDGET_USD = 0.15;

const LESSON_PROMPT_TEMPLATE = `You are extracting one lesson learned from a completed Claude Code worker cycle.

Given the task prompt and its output, produce a short, reusable lesson that future cycles on this or similar projects should know. Be honest about failure — failed cycles often teach more than successful ones.

Skip writing a lesson and respond {"skip": true, "reason": "..."} if:
- the task was completely trivial (rename a variable, run a single command),
- nothing in the output is worth remembering beyond the immediate change,
- there's no generalizable insight.

Otherwise respond with exactly one JSON object:

{
  "outcome": "success" | "partial" | "failure",
  "title": "<one short line, imperative or noun phrase>",
  "body": "<2–6 sentences. Capture what was attempted, what happened, and the durable insight. Name files or commands only when they generalize.>",
  "tags": ["<lowercase tag>", "<…>"],
  "importance": 1 | 2 | 3 | 4 | 5
}

importance scale:
  1 = nice-to-know
  3 = useful default
  5 = critical "do not forget this" guardrail`;

interface RawLesson {
  outcome?: LessonOutcome;
  title?: string;
  body?: string;
  tags?: unknown;
  importance?: number;
  skip?: boolean;
  reason?: string;
}

/**
 * Parse the model's response. Tolerant of leading/trailing prose.
 */
function parseLesson(raw: string): RawLesson | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as RawLesson;
  } catch {
    return null;
  }
}

/**
 * Generate a lesson from a completed worker task. Returns the persisted
 * Lesson row, or null if generation was skipped or failed.
 */
export async function generateLessonFromTask(
  taskId: string,
): Promise<Lesson | null> {
  const task = getTaskById(taskId);
  if (!task) {
    logger.warn(`generateLessonFromTask: task not found: ${taskId}`);
    return null;
  }
  if (task.skill_id !== 'claude_code_worker') {
    return null; // only learn from worker cycles for now
  }
  if (task.status !== 'completed' && task.status !== 'failed') {
    return null;
  }

  // Pull the worker prompt and output.
  const input = task.input_json ? safeParse(task.input_json) : {};
  const output = task.output_json ? safeParse(task.output_json) : {};
  const prompt = String(input?.prompt ?? '');
  const outputText = String(output?.output ?? task.error_message ?? '');
  const outcomeHint: LessonOutcome =
    task.status === 'completed' ? 'success' : 'failure';

  if (!prompt && !outputText) return null;

  const ask = `${LESSON_PROMPT_TEMPLATE}

---
PROJECT: ${task.project_id ?? '(none)'}
STATUS: ${task.status} (hint: ${outcomeHint})

WORKER PROMPT:
${prompt.slice(0, 2000)}

WORKER OUTPUT:
${outputText.slice(0, 4000)}`;

  let resultText = '';
  try {
    for await (const msg of query({
      prompt: ask,
      options: {
        model: MODELS.opus,
        maxTurns: 1,
        maxBudgetUsd: LESSON_BUDGET_USD,
      },
    })) {
      const m = msg as { type?: string; subtype?: string; result?: string };
      if (m.type === 'result' && m.subtype === 'success' && m.result) {
        resultText = m.result;
      }
    }
  } catch (err) {
    logger.warn(`lesson generation failed for ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (!resultText) return null;

  const parsed = parseLesson(resultText);
  if (!parsed) {
    logger.warn(`lesson generation: unparseable response for ${taskId}`);
    return null;
  }
  if (parsed.skip) {
    return null;
  }
  if (!parsed.title || !parsed.body || !parsed.outcome) {
    logger.warn(`lesson generation: missing required fields for ${taskId}`);
    return null;
  }

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return createLesson({
    project_id: task.project_id,
    source_task_id: task.id,
    outcome: parsed.outcome,
    title: parsed.title.slice(0, 200),
    body: parsed.body.slice(0, 4000),
    tags,
    importance: Math.max(1, Math.min(5, parsed.importance ?? 3)),
  });
}

/**
 * Extract candidate keywords from a worker prompt — used to rank
 * lessons for retrieval. Cheap and dependency-free: lowercase, dedup,
 * strip common stopwords.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'will',
  'should', 'would', 'could', 'about', 'into', 'their', 'there', 'they',
  'what', 'when', 'where', 'which', 'while', 'your', 'them', 'then',
  'project', 'task', 'worker', 'overseer', 'please',
]);

function keywordsFromPrompt(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9_\-/.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 12);
}

/**
 * Format a list of lessons as a compact bulleted block suitable for
 * prepending to a worker prompt.
 */
export function formatLessonsForPrompt(lessons: Lesson[]): string {
  if (lessons.length === 0) return '';
  const lines = ['## Lessons learned (from prior cycles)'];
  for (const l of lessons) {
    const marker = l.outcome === 'success' ? '✓' : l.outcome === 'partial' ? '~' : '✗';
    lines.push(`- ${marker} **${l.title}** — ${l.body.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  return lines.join('\n');
}

/**
 * Recall the top lessons for a project + upcoming prompt and return
 * them already formatted for prompt injection.
 *
 * @param projectId - The project the worker is being dispatched into
 * @param prompt    - The worker prompt (used for keyword ranking)
 * @param limit     - Max lessons to inject (default 5)
 * @returns A formatted markdown block, or empty string when none apply
 */
export function recallLessonsForPrompt(
  projectId: string,
  prompt: string,
  limit = 5,
): string {
  const keywords = keywordsFromPrompt(prompt);
  const lessons = getRelevantLessons(projectId, keywords, limit);
  return formatLessonsForPrompt(lessons);
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

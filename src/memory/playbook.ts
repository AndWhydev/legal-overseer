/**
 * Living playbook per project.
 *
 * After lessons accumulate, the overseer can synthesize them into a
 * `PLAYBOOK.md` at the project root. Workers always read this file
 * because it sits next to CLAUDE.md and is picked up the same way.
 *
 * Rewriting is intentionally batched (call rewriteProjectPlaybook
 * weekly or after N new lessons) rather than after every task — Opus
 * costs add up and the playbook should be stable.
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { MODELS } from '../agent/models.js';
import { createSafeLogger } from '../governance/index.js';
import {
  getProjectById,
  type Project,
} from '../db/repositories/projects.js';
import {
  getLessonsByProject,
  type Lesson,
} from '../db/repositories/lessons.js';

const logger = createSafeLogger('Playbook');

const PLAYBOOK_BUDGET_USD = 0.5;

const PLAYBOOK_PROMPT = `You are maintaining a project's PLAYBOOK.md.

The playbook is a short, opinionated guide that Claude Code workers read at the start of every cycle. It captures the project-specific patterns, pitfalls, and conventions accumulated from prior worker runs.

You will be given:
- the existing PLAYBOOK.md (may be empty)
- a list of lessons learned from recent worker cycles

Produce the NEW PLAYBOOK.md content (full file, ready to write). Rules:
- Lead with a one-paragraph "About this project" summary if you can infer one; otherwise omit.
- Organize by section: "Conventions", "Pitfalls", "Operating notes". Skip empty sections.
- Use bullets, not paragraphs. One short sentence per bullet.
- Promote successful patterns and explicit "don't" rules. Cite the lesson title in parens for traceability when useful.
- Discard duplicates and superseded advice — the playbook should not grow unboundedly.
- Keep total length under 200 lines.
- Output ONLY the markdown, no surrounding commentary or code fences.`;

export interface RewriteResult {
  /** Whether the playbook file was written */
  written: boolean;
  /** Absolute path of the playbook */
  path: string;
  /** Length of the new playbook in chars, or 0 if not written */
  newLength: number;
  /** Lessons consumed in this rewrite */
  lessonsConsidered: number;
  /** Approx cost in USD */
  costUsd?: number;
  /** Reason rewrite was skipped (when written=false) */
  skipReason?: string;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Rewrite (or initialize) the project's PLAYBOOK.md from its lessons.
 *
 * No-op if the project has zero lessons.
 *
 * @param projectId - Project to rewrite the playbook for
 * @param minLessons - Skip if the project has fewer lessons than this
 */
export async function rewriteProjectPlaybook(
  projectId: string,
  minLessons = 3,
): Promise<RewriteResult> {
  const project = getProjectById(projectId);
  if (!project) {
    return {
      written: false,
      path: '',
      newLength: 0,
      lessonsConsidered: 0,
      skipReason: 'project not found',
    };
  }

  const lessons = getLessonsByProject(projectId, 100);
  const path = join(project.path, 'PLAYBOOK.md');

  if (lessons.length < minLessons) {
    return {
      written: false,
      path,
      newLength: 0,
      lessonsConsidered: lessons.length,
      skipReason: `only ${lessons.length} lesson(s) — need ${minLessons}`,
    };
  }

  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lessonsBlock = lessons
    .map((l) => formatLessonForPlaybook(l))
    .join('\n');

  const ask = `${PLAYBOOK_PROMPT}

---
PROJECT: ${project.name}
PATH: ${project.path}

EXISTING PLAYBOOK.md:
${existing || '(none)'}

LESSONS (${lessons.length}, newest first):
${lessonsBlock}`;

  let newContent = '';
  let costUsd: number | undefined;

  try {
    for await (const msg of query({
      prompt: ask,
      options: {
        model: MODELS.opus,
        maxTurns: 1,
        maxBudgetUsd: PLAYBOOK_BUDGET_USD,
      },
    })) {
      const m = msg as { type?: string; subtype?: string; result?: string; total_cost_usd?: number };
      if (m.type === 'result' && m.subtype === 'success' && m.result) {
        newContent = m.result;
      }
      if (m.type === 'result' && typeof m.total_cost_usd === 'number') {
        costUsd = m.total_cost_usd;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`playbook rewrite failed for ${project.name}: ${msg}`);
    return {
      written: false,
      path,
      newLength: 0,
      lessonsConsidered: lessons.length,
      error: msg,
    };
  }

  // Strip markdown code fences if the model added them anyway.
  newContent = stripCodeFence(newContent.trim());

  if (!newContent) {
    return {
      written: false,
      path,
      newLength: 0,
      lessonsConsidered: lessons.length,
      costUsd,
      skipReason: 'model returned empty playbook',
    };
  }

  try {
    writeFileSync(path, newContent, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      written: false,
      path,
      newLength: 0,
      lessonsConsidered: lessons.length,
      costUsd,
      error: `failed to write ${path}: ${msg}`,
    };
  }

  logger.info(
    `playbook rewritten for ${project.name}: ${lessons.length} lessons → ${newContent.length} chars`,
  );

  return {
    written: true,
    path,
    newLength: newContent.length,
    lessonsConsidered: lessons.length,
    costUsd,
  };
}

function formatLessonForPlaybook(l: Lesson): string {
  const marker = l.outcome === 'success' ? '✓' : l.outcome === 'partial' ? '~' : '✗';
  const tags = l.tags ? ` [${l.tags}]` : '';
  return `- ${marker} (importance=${l.importance})${tags} **${l.title}**\n  ${l.body.replace(/\s+/g, ' ')}`;
}

function stripCodeFence(s: string): string {
  // Sometimes Opus wraps in ```markdown ... ```; peel one outer fence.
  const fenced = s.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1] : s;
}

/**
 * Helper for the briefing/dashboard: project name + playbook stats.
 */
export function getPlaybookStatus(project: Project): {
  exists: boolean;
  path: string;
  sizeBytes: number;
} {
  const path = join(project.path, 'PLAYBOOK.md');
  if (!existsSync(path)) {
    return { exists: false, path, sizeBytes: 0 };
  }
  try {
    const content = readFileSync(path, 'utf8');
    return { exists: true, path, sizeBytes: content.length };
  } catch {
    return { exists: false, path, sizeBytes: 0 };
  }
}

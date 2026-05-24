/**
 * 1.2 — Auto-generated Matter Strategy.
 *
 * When a matter is marked active (status='open' after intake), Opus
 * reads matter facts + client details and produces a structured legal
 * strategy. Strategy goes through the human review queue. Once a lawyer
 * approves it, the strategy is stored as matter_strategies (status =
 * approved) AND mirrored as strategy.md in the matter folder so the
 * agents can read it before any task.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { enqueueForReview, approveReview, rejectReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById, type Matter } from '../db/repositories/matters.js';
import { callLlmWithRedaction } from './llm.js';

const logger = createSafeLogger('StrategyGen');

export interface MatterStrategy {
  id: string;
  matter_id: string;
  version: number;
  body_markdown: string;
  status: 'draft' | 'approved' | 'rejected' | 'superseded';
  review_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

function strategyFolderRoot(): string {
  return process.env.MATTER_FOLDERS_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/matters' : './data/matters');
}

function strategyPathFor(matter: Matter): string {
  const dir = matter.matter_folder ?? join(strategyFolderRoot(), matter.matter_number);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'strategy.md');
}

function nextVersion(matterId: string): number {
  const db = getDatabase();
  const row = db
    .prepare('SELECT MAX(version) AS v FROM matter_strategies WHERE matter_id = ?')
    .get(matterId) as { v: number | null };
  return (row.v ?? 0) + 1;
}

export interface GenerateStrategyInput {
  matterId: string;
  acting: string;
  /** Mark the previous strategy as superseded (used when facts change). */
  supersedePrevious?: boolean;
}

export async function generateMatterStrategy(
  input: GenerateStrategyInput,
): Promise<MatterStrategy> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);

  if (input.supersedePrevious) {
    const db = getDatabase();
    db.prepare(
      `UPDATE matter_strategies SET status = 'superseded'
       WHERE matter_id = ? AND status IN ('draft', 'approved')`,
    ).run(matter.id);
  }

  const facts = matter.notes ?? '';
  const promptHeader = `You are a senior Australian solicitor producing a draft strategy memo for a colleague to review.

Matter: ${matter.matter_number} — ${matter.title}
Matter type: ${matter.matter_type}
Jurisdiction: ${matter.jurisdiction}
Client: ${matter.client_name}
Opposing party: ${matter.opposing_party ?? '(none)'}

Produce a structured strategy memo with these sections (Markdown):

# Strategy — ${matter.matter_number}

## Key legal issues
- ...

## Recommended approach
- ...

## Potential obstacles
- ...

## Suggested next steps
- ...

## Estimated timeline
- ...

## Resource requirements
- ...

Use [UNVERIFIED] markers for any case or statute citations. Use Australian English.`;

  const llm = await callLlmWithRedaction(matter.id, promptHeader, facts, 'opus', 3.0);
  const body_markdown = wrapWithDisclaimer(
    llm.ok && llm.text
      ? llm.text
      : `# Strategy — ${matter.matter_number}\n\nStrategy generation failed: ${llm.error ?? 'no output'}`,
  );

  const version = nextVersion(matter.id);
  const id = randomUUID();
  const now = new Date().toISOString();

  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'strategy_generator',
    outputKind: 'matter_management',
    title: `Strategy memo v${version} — ${matter.matter_number}`,
    bodyMarkdown: body_markdown,
    metadata: {
      kind: 'matter_strategy',
      matter_id: matter.id,
      version,
      redactionCount: llm.redactionCount,
    },
    costUsd: llm.costUsd,
  });

  const db = getDatabase();
  db.prepare(
    `INSERT INTO matter_strategies (id, matter_id, version, body_markdown, status, review_id, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
  ).run(id, matter.id, version, body_markdown, review.id, now);

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'strategy_generator',
      description: `Strategy v${version}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
      reviewId: review.id,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'strategy.generate',
    detail: `Strategy v${version} drafted, awaiting lawyer review`,
    refTable: 'matter_strategies',
    refId: id,
    modelUsed: 'opus',
  });

  logger.info(`strategy v${version} drafted for ${matter.matter_number}`);
  return getMatterStrategy(id) as MatterStrategy;
}

export function getMatterStrategy(id: string): MatterStrategy | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM matter_strategies WHERE id = ?').get(id) as
      | MatterStrategy
      | undefined) ?? null
  );
}

export function getApprovedStrategy(matterId: string): MatterStrategy | null {
  const db = getDatabase();
  return (
    (db
      .prepare(
        `SELECT * FROM matter_strategies
         WHERE matter_id = ? AND status = 'approved'
         ORDER BY version DESC LIMIT 1`,
      )
      .get(matterId) as MatterStrategy | undefined) ?? null
  );
}

export function listMatterStrategies(matterId: string): MatterStrategy[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM matter_strategies WHERE matter_id = ? ORDER BY version DESC`,
    )
    .all(matterId) as MatterStrategy[];
}

export function approveStrategy(id: string, acting: string, note?: string): MatterStrategy {
  const strategy = getMatterStrategy(id);
  if (!strategy) throw new Error(`strategy ${id} not found`);
  if (strategy.status !== 'draft') throw new Error(`strategy ${id} is ${strategy.status}, cannot approve`);

  if (strategy.review_id) {
    approveReview({ reviewId: strategy.review_id, reviewer: acting, note });
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE matter_strategies SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
  ).run(acting, now, id);

  // Mirror the approved strategy to the matter folder.
  const matter = getMatterById(strategy.matter_id);
  if (matter) {
    try {
      writeFileSync(strategyPathFor(matter), strategy.body_markdown, { mode: 0o600 });
    } catch (err) {
      logger.warn(
        `could not mirror strategy.md for ${matter.matter_number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  appendLegalAudit({
    matterId: strategy.matter_id,
    actorId: acting,
    action: 'strategy.approve',
    detail: `Strategy v${strategy.version} approved`,
    refTable: 'matter_strategies',
    refId: id,
    metadata: { note: note ?? null },
  });
  return getMatterStrategy(id) as MatterStrategy;
}

export function rejectStrategy(id: string, acting: string, note?: string): MatterStrategy {
  const strategy = getMatterStrategy(id);
  if (!strategy) throw new Error(`strategy ${id} not found`);
  if (strategy.status !== 'draft') throw new Error(`strategy ${id} is ${strategy.status}, cannot reject`);
  if (strategy.review_id) {
    rejectReview({ reviewId: strategy.review_id, reviewer: acting, note });
  }
  const db = getDatabase();
  db.prepare(`UPDATE matter_strategies SET status = 'rejected' WHERE id = ?`).run(id);
  appendLegalAudit({
    matterId: strategy.matter_id,
    actorId: acting,
    action: 'strategy.reject',
    detail: `Strategy v${strategy.version} rejected`,
    refTable: 'matter_strategies',
    refId: id,
    metadata: { note: note ?? null },
  });
  return getMatterStrategy(id) as MatterStrategy;
}

/**
 * Read the approved strategy.md for a matter directly from disk.
 * Agents call this before executing any drafting task on the matter.
 */
export function readMatterStrategyFile(matter: Matter): string | null {
  try {
    const path = strategyPathFor(matter);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

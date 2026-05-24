/**
 * 1.6 — Jurisdiction comparison.
 *
 * Triggered when a matter is tagged with multiple Australian states
 * (or international jurisdictions). Queries AustLII for relevant
 * legislation in each jurisdiction and asks Opus to produce a
 * comparison table flagging where jurisdiction choice could favour
 * the client. Stored as jurisdiction-comparison.md in the matter
 * folder and appended to the matter strategy.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { getMatterById, type Matter } from '../db/repositories/matters.js';
import { searchAustLii } from '../integrations/austlii/search.js';
import { callLlmWithRedaction } from './llm.js';

const logger = createSafeLogger('JurisdictionCompare');

export interface JurisdictionComparison {
  id: string;
  matter_id: string;
  jurisdictions_json: string;
  comparison_markdown: string;
  recommended_jurisdiction: string | null;
  created_at: string;
}

function comparisonPath(matter: Matter): string {
  const root = process.env.MATTER_FOLDERS_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/matters' : './data/matters');
  const dir = matter.matter_folder ?? join(root, matter.matter_number);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'jurisdiction-comparison.md');
}

export interface CompareJurisdictionsInput {
  matterId: string;
  jurisdictions: string[];
  topic: string;
  acting: string;
}

export async function compareJurisdictions(
  input: CompareJurisdictionsInput,
): Promise<JurisdictionComparison> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  if (input.jurisdictions.length < 2) {
    throw new Error('jurisdiction comparison requires at least two jurisdictions');
  }

  // Pull AustLII results per jurisdiction.
  const austliiByJur: Record<string, string> = {};
  for (const j of input.jurisdictions) {
    const r = await searchAustLii({ query: `${input.topic} ${j}`, limit: 5 });
    austliiByJur[j] = r.results.length
      ? r.results.map((rr) => `  - ${rr.citation} (${rr.url})`).join('\n')
      : '  (no AustLII results)';
  }

  const promptHeader = `You are an Australian lawyer producing a comparison of jurisdictions for the following matter.

Matter: ${matter.matter_number} — ${matter.title}
Topic: ${input.topic}
Jurisdictions to compare: ${input.jurisdictions.join(', ')}

Relevant AustLII results by jurisdiction:
${Object.entries(austliiByJur).map(([j, s]) => `${j}:\n${s}`).join('\n')}

Produce a Markdown comparison memo with these sections:

# Jurisdiction comparison — ${input.topic}

## Summary
2-3 sentences naming the recommended jurisdiction and why.

## Comparison table
| Issue | ${input.jurisdictions.join(' | ')} |
| --- | ${input.jurisdictions.map(() => '---').join(' | ')} |
| ... |

Cover at least: applicable legislation (with section numbers), limitation periods,
procedural requirements, costs, court rules, available remedies.

## Where jurisdiction choice could favour the client
- ...

## Recommended jurisdiction
NAME — one paragraph rationale.

Mark every case / statute citation [UNVERIFIED]. Use Australian English.`;

  const llm = await callLlmWithRedaction(matter.id, promptHeader, matter.notes ?? '', 'opus', 3.0);
  const body_markdown =
    llm.ok && llm.text
      ? llm.text
      : `# Jurisdiction comparison\n\nGeneration failed: ${llm.error ?? 'no output'}`;

  // Extract recommended jurisdiction (look for "Recommended jurisdiction" heading).
  let recommended: string | null = null;
  const match = body_markdown.match(/recommended jurisdiction[:\s]*([A-Z][A-Za-z ]+)/i);
  if (match) recommended = match[1].trim().split(/\s+/)[0];

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO jurisdiction_comparisons
       (id, matter_id, jurisdictions_json, comparison_markdown,
        recommended_jurisdiction, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    JSON.stringify(input.jurisdictions),
    body_markdown,
    recommended,
    now,
  );

  try {
    writeFileSync(comparisonPath(matter), body_markdown, { mode: 0o600 });
  } catch (err) {
    logger.warn(`could not mirror jurisdiction-comparison.md: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'jurisdiction_compare',
      description: `Jurisdiction comparison: ${input.jurisdictions.join(' vs ')}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'jurisdiction.compare',
    detail: `Compared ${input.jurisdictions.join(', ')} for ${input.topic}`,
    refTable: 'jurisdiction_comparisons',
    refId: id,
    modelUsed: 'opus',
    metadata: { recommended },
  });

  logger.info(`jurisdiction comparison for ${matter.matter_number}: recommended ${recommended ?? '(none)'}`);
  return db
    .prepare('SELECT * FROM jurisdiction_comparisons WHERE id = ?')
    .get(id) as JurisdictionComparison;
}

export function listMatterJurisdictionComparisons(matterId: string): JurisdictionComparison[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM jurisdiction_comparisons WHERE matter_id = ? ORDER BY created_at DESC`,
    )
    .all(matterId) as JurisdictionComparison[];
}

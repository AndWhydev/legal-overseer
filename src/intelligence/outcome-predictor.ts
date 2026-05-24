/**
 * 1.1 — Predictive Case Outcome Analysis.
 *
 * Given a matter (or raw facts), pulls similar precedents from the
 * firm's precedent library + AustLII hits, and asks Opus to estimate
 * win/lose/settle probabilities, a settlement band, a 1-10 litigation
 * risk score, key risk factors, and recommended approach.
 *
 * Stored against the matter as an outcome_analyses row. Lawyer must
 * acknowledge a disclaimer before viewing the analysis. Logged in the
 * legal_audit_log.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { recordAiRun } from '../compliance/billing.js';
import { getMatterById } from '../db/repositories/matters.js';
import { listPrecedents, type Precedent } from '../precedents/repo.js';
import { searchAustLii } from '../integrations/austlii/search.js';
import { callLlmWithRedaction, extractJson } from './llm.js';

const logger = createSafeLogger('OutcomePredictor');

export interface OutcomePredictionInput {
  matterId: string;
  /** Optional override of facts when matter.notes is sparse. */
  factsOverride?: string;
  acting: string;
}

export interface OutcomePrediction {
  id: string;
  matter_id: string;
  win_probability: number | null;
  lose_probability: number | null;
  settle_probability: number | null;
  settlement_min_aud: number | null;
  settlement_max_aud: number | null;
  litigation_risk_score: number | null;
  risk_factors_json: string | null;
  recommended_approach: string | null;
  analysis_markdown: string;
  precedent_ids: string | null;
  austlii_refs: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface ModelOutput {
  winProbability?: number;
  loseProbability?: number;
  settleProbability?: number;
  settlementMinAud?: number;
  settlementMaxAud?: number;
  litigationRiskScore?: number;
  riskFactors?: string[];
  recommendedApproach?: string;
  analysisMarkdown?: string;
}

function selectRelevantPrecedents(matterType: string): Precedent[] {
  const all = listPrecedents();
  return all
    .filter((p) => !matterType || p.matter_type === matterType)
    .slice(0, 5);
}

export async function predictMatterOutcome(
  input: OutcomePredictionInput,
): Promise<OutcomePrediction> {
  const startedAt = Date.now();
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);

  const facts = input.factsOverride ?? matter.notes ?? '';
  const precedents = selectRelevantPrecedents(matter.matter_type);
  const precedentIds = precedents.map((p) => p.id);
  const precedentSummary = precedents.length
    ? precedents
        .map(
          (p) =>
            `- ${p.title} (${p.matter_type ?? 'general'}): ${p.body_markdown.slice(0, 300)}`,
        )
        .join('\n')
    : '(no firm precedents found for this matter type)';

  const austliiQuery = `${matter.matter_type} ${matter.jurisdiction} ${facts.slice(0, 200)}`;
  const austlii = await searchAustLii({ query: austliiQuery, limit: 5 });
  const austliiRefs = austlii.results.map((r) => r.url);
  const austliiSummary = austlii.results.length
    ? austlii.results.map((r) => `- ${r.citation} — ${r.url}`).join('\n')
    : '(no AustLII matches)';

  const promptHeader = `You are a senior Australian litigation analyst.

Estimate likely outcomes for the following matter. You MUST respond with strict JSON.

Matter type: ${matter.matter_type}
Jurisdiction: ${matter.jurisdiction}
Title: ${matter.title}
Opposing party: ${matter.opposing_party ?? '(not recorded)'}

Firm precedents (similar past matters):
${precedentSummary}

AustLII relevant decisions:
${austliiSummary}

Respond with a JSON object of the following shape:
{
  "winProbability": 0.0-1.0,
  "loseProbability": 0.0-1.0,
  "settleProbability": 0.0-1.0,
  "settlementMinAud": <number or null>,
  "settlementMaxAud": <number or null>,
  "litigationRiskScore": 1-10,
  "riskFactors": ["...", "..."],
  "recommendedApproach": "2-4 sentences",
  "analysisMarkdown": "structured markdown explanation citing the precedents above and the AustLII hits"
}

Probabilities should sum to approximately 1.0. Be honest about uncertainty.`;

  const llm = await callLlmWithRedaction(
    input.matterId,
    promptHeader,
    facts,
    'opus',
    4.0,
  );

  const parsed = extractJson<ModelOutput>(llm.text) ?? {};
  const analysis_markdown =
    parsed.analysisMarkdown ??
    `# Outcome Analysis — ${matter.matter_number}\n\nThe model did not return a parseable analysis. Raw output:\n\n${llm.text.slice(0, 4000)}`;

  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO outcome_analyses
       (id, matter_id, win_probability, lose_probability, settle_probability,
        settlement_min_aud, settlement_max_aud, litigation_risk_score,
        risk_factors_json, recommended_approach, analysis_markdown,
        precedent_ids, austlii_refs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    parsed.winProbability ?? null,
    parsed.loseProbability ?? null,
    parsed.settleProbability ?? null,
    parsed.settlementMinAud ?? null,
    parsed.settlementMaxAud ?? null,
    parsed.litigationRiskScore ?? null,
    parsed.riskFactors ? JSON.stringify(parsed.riskFactors) : null,
    parsed.recommendedApproach ?? null,
    analysis_markdown,
    precedentIds.length ? JSON.stringify(precedentIds) : null,
    austliiRefs.length ? JSON.stringify(austliiRefs) : null,
    now,
  );

  if (llm.costUsd && llm.costUsd > 0) {
    recordAiRun({
      matterId: matter.id,
      skillId: 'outcome_predictor',
      description: `Outcome analysis for ${matter.matter_number}`,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      costUsd: llm.costUsd,
    });
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'outcome.predict',
    detail: `Outcome analysis generated (risk score ${parsed.litigationRiskScore ?? '-'}, ${precedents.length} precedents, ${austlii.results.length} AustLII refs)`,
    refTable: 'outcome_analyses',
    refId: id,
    modelUsed: 'opus',
    metadata: { redactionCount: llm.redactionCount, costUsd: llm.costUsd ?? null },
  });

  logger.info(`outcome analysis for ${matter.matter_number}: risk=${parsed.litigationRiskScore ?? '?'}/10`);
  return getOutcomePrediction(id) as OutcomePrediction;
}

export function getOutcomePrediction(id: string): OutcomePrediction | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM outcome_analyses WHERE id = ?').get(id) as
      | OutcomePrediction
      | undefined) ?? null
  );
}

export function getLatestOutcomePrediction(matterId: string): OutcomePrediction | null {
  const db = getDatabase();
  return (
    (db
      .prepare(
        `SELECT * FROM outcome_analyses WHERE matter_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(matterId) as OutcomePrediction | undefined) ?? null
  );
}

export function acknowledgeOutcomePrediction(
  id: string,
  acknowledgingUser: string,
): OutcomePrediction {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE outcome_analyses SET acknowledged_by = ?, acknowledged_at = ? WHERE id = ?`,
  ).run(acknowledgingUser, now, id);
  const fresh = getOutcomePrediction(id);
  if (!fresh) throw new Error(`outcome analysis ${id} not found after acknowledge`);
  appendLegalAudit({
    matterId: fresh.matter_id,
    actorId: acknowledgingUser,
    action: 'outcome.acknowledge',
    detail: 'lawyer viewed outcome analysis and acknowledged AI-not-legal-advice disclaimer',
    refTable: 'outcome_analyses',
    refId: id,
  });
  return fresh;
}

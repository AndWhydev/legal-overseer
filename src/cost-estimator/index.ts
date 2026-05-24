/**
 * Matter cost estimator.
 *
 * Produces an AI-cost + lawyer-hour estimate before the matter
 * starts. Estimates are matter-type driven (rough baselines from
 * observed runs) and complexity-scaled. The lawyer can override at
 * any time; the estimate is stored once per matter in the
 * `matter_cost_estimates` table.
 *
 * The dashboard renders the estimate next to the running actual on
 * /billing and on the per-matter view, and emits a warning when the
 * actual approaches the estimate.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { summariseMatterBilling } from '../compliance/billing.js';

export type Complexity = 'simple' | 'medium' | 'complex';

export interface MatterTypeBaseline {
  /** Expected AI spend in USD for a "medium" complexity matter. */
  medium_ai_usd: number;
  /** Expected lawyer hours for a "medium" complexity matter. */
  medium_lawyer_hours: number;
}

/**
 * Per-matter-type baseline. Derived from production observations
 * across pilot deployments; partners should tune these per firm by
 * editing this object once a few real matters have closed.
 */
const BASELINES: Record<string, MatterTypeBaseline> = {
  contract:      { medium_ai_usd: 8,   medium_lawyer_hours: 6 },
  employment:    { medium_ai_usd: 6,   medium_lawyer_hours: 5 },
  estates:       { medium_ai_usd: 4,   medium_lawyer_hours: 4 },
  family:        { medium_ai_usd: 10,  medium_lawyer_hours: 12 },
  property:      { medium_ai_usd: 6,   medium_lawyer_hours: 5 },
  commercial:    { medium_ai_usd: 12,  medium_lawyer_hours: 10 },
  litigation:    { medium_ai_usd: 25,  medium_lawyer_hours: 40 },
  criminal:      { medium_ai_usd: 8,   medium_lawyer_hours: 20 },
  immigration:   { medium_ai_usd: 5,   medium_lawyer_hours: 6 },
  regulatory:    { medium_ai_usd: 18,  medium_lawyer_hours: 16 },
  unclassified:  { medium_ai_usd: 6,   medium_lawyer_hours: 5 },
};

const COMPLEXITY_SCALE: Record<Complexity, number> = {
  simple: 0.4,
  medium: 1.0,
  complex: 2.5,
};

export interface CostEstimate {
  matterType: string;
  complexity: Complexity;
  estimatedAiUsd: number;
  estimatedLawyerHours: number;
  notes: string;
}

export function estimateMatterCost(matterType: string, complexity: Complexity): CostEstimate {
  const base = BASELINES[matterType] ?? BASELINES.unclassified;
  const scale = COMPLEXITY_SCALE[complexity];
  return {
    matterType,
    complexity,
    estimatedAiUsd: +(base.medium_ai_usd * scale).toFixed(2),
    estimatedLawyerHours: +(base.medium_lawyer_hours * scale).toFixed(1),
    notes: `Based on baseline for "${matterType}" (medium=${base.medium_ai_usd} USD AI, ${base.medium_lawyer_hours}h lawyer) × ${complexity} (×${scale}).`,
  };
}

export interface SaveMatterCostEstimateInput {
  matterId: string;
  matterType: string;
  complexity: Complexity;
  estimatedAiUsd: number;
  estimatedLawyerHours: number;
  currency?: string;
  notes?: string | null;
}

export interface StoredMatterCostEstimate {
  id: string;
  matter_id: string;
  matter_type: string;
  complexity: Complexity;
  estimated_ai_usd: number;
  estimated_lawyer_hours: number;
  currency: string;
  notes: string | null;
  created_at: string;
}

export function saveMatterCostEstimate(input: SaveMatterCostEstimateInput): StoredMatterCostEstimate {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM matter_cost_estimates WHERE matter_id = ?')
    .get(input.matterId) as StoredMatterCostEstimate | undefined;
  if (existing) {
    db.prepare(
      `UPDATE matter_cost_estimates SET
         matter_type = ?, complexity = ?, estimated_ai_usd = ?,
         estimated_lawyer_hours = ?, currency = ?, notes = ?
       WHERE id = ?`,
    ).run(
      input.matterType, input.complexity, input.estimatedAiUsd,
      input.estimatedLawyerHours, input.currency ?? 'AUD',
      input.notes ?? null, existing.id,
    );
    return getMatterCostEstimate(input.matterId) as StoredMatterCostEstimate;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO matter_cost_estimates
       (id, matter_id, matter_type, complexity, estimated_ai_usd,
        estimated_lawyer_hours, currency, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.matterId, input.matterType, input.complexity,
    input.estimatedAiUsd, input.estimatedLawyerHours,
    input.currency ?? 'AUD', input.notes ?? null,
  );
  return getMatterCostEstimate(input.matterId) as StoredMatterCostEstimate;
}

export function getMatterCostEstimate(matterId: string): StoredMatterCostEstimate | null {
  const db = getDatabase();
  return (db
    .prepare('SELECT * FROM matter_cost_estimates WHERE matter_id = ?')
    .get(matterId) as StoredMatterCostEstimate | undefined) ?? null;
}

export interface MatterCostStatus {
  estimate: StoredMatterCostEstimate | null;
  actualAiUsd: number;
  actualAiSeconds: number;
  actualLawyerSeconds: number;
  pctOfEstimate: number | null;
  thresholdWarning: boolean;
  /** True once actual AI spend has exceeded the estimate. */
  overBudget: boolean;
}

const WARNING_PCT = 75;

export function getMatterCostStatus(matterId: string): MatterCostStatus {
  const estimate = getMatterCostEstimate(matterId);
  const summary = summariseMatterBilling(matterId);
  const pct = estimate && estimate.estimated_ai_usd > 0
    ? Math.round((summary.aiCostUsd / estimate.estimated_ai_usd) * 100)
    : null;
  return {
    estimate,
    actualAiUsd: summary.aiCostUsd,
    actualAiSeconds: summary.aiSeconds,
    actualLawyerSeconds: summary.lawyerSeconds,
    pctOfEstimate: pct,
    thresholdWarning: pct !== null && pct >= WARNING_PCT && pct < 100,
    overBudget: pct !== null && pct >= 100,
  };
}

export interface MonthlyMatterCost {
  matterId: string;
  matterNumber: string;
  matterTitle: string;
  ym: string;
  aiUsd: number;
  aiSeconds: number;
  lawyerSeconds: number;
}

/**
 * Per-matter cost roll-up for one calendar month. Used in the
 * billing dashboard's "this month" section.
 */
export function listMonthlyMatterCosts(yearMonth: string): MonthlyMatterCost[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
         m.id AS matterId, m.matter_number AS matterNumber, m.title AS matterTitle,
         SUM(CASE WHEN b.kind = 'ai_run' THEN b.cost_usd ELSE 0 END) AS aiUsd,
         SUM(CASE WHEN b.kind = 'ai_run' THEN b.duration_seconds ELSE 0 END) AS aiSeconds,
         SUM(CASE WHEN b.kind = 'lawyer_time' THEN b.duration_seconds ELSE 0 END) AS lawyerSeconds
       FROM matters m
       LEFT JOIN billing_log b ON b.matter_id = m.id
         AND substr(b.created_at, 1, 7) = ?
       GROUP BY m.id
       ORDER BY aiUsd DESC`,
    )
    .all(yearMonth) as Array<Omit<MonthlyMatterCost, 'ym'>>;
  return rows.map((r) => ({ ...r, ym: yearMonth }));
}

/**
 * Trust score repository module for BitBit
 *
 * Implements graduated autonomy through runtime trust tracking.
 * Uses Bayesian averaging with time decay for trust score calculation.
 */

import { getDatabase } from '../connection.js';

/**
 * Autonomy levels 1-5 based on reliability score
 */
export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Trust score record from database
 */
export interface TrustScore {
  id: string;
  agentId: string;
  skillId: string;
  domain: string;
  successfulExecutions: number;
  failedExecutions: number;
  humanOverrides: number;
  reliabilityScore: number;
  autonomyLevel: AutonomyLevel;
  canAutoApprove: boolean;
  requiresHumanReview: boolean;
  lastAnomaly: string | null;
  updatedAt: string;
}

/**
 * Input for trust score calculation
 */
interface TrustScoreInput {
  successfulExecutions: number;
  failedExecutions: number;
  humanOverrides: number;
  lastAnomalyDays: number | null;
  recentSuccessRate: number;
}

/**
 * Get trust score for an agent/skill/domain combination
 *
 * @param agentId - Agent ID
 * @param skillId - Skill ID
 * @param domain - Domain (e.g., 'financial', 'content', 'research')
 * @returns Trust score record or null if not found
 */
export function getTrustScore(
  agentId: string,
  skillId: string,
  domain: string
): TrustScore | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT
      id,
      agent_id as agentId,
      skill_id as skillId,
      domain,
      successful_executions as successfulExecutions,
      failed_executions as failedExecutions,
      human_overrides as humanOverrides,
      reliability_score as reliabilityScore,
      autonomy_level as autonomyLevel,
      can_auto_approve as canAutoApprove,
      requires_human_review as requiresHumanReview,
      last_anomaly as lastAnomaly,
      updated_at as updatedAt
    FROM trust_scores
    WHERE agent_id = ? AND skill_id = ? AND domain = ?
  `
    )
    .get(agentId, skillId, domain) as TrustScore | undefined;

  if (!row) return null;

  return {
    ...row,
    canAutoApprove: Boolean(row.canAutoApprove),
    requiresHumanReview: Boolean(row.requiresHumanReview),
  };
}

/**
 * Calculate trust score using Bayesian averaging with time decay
 *
 * Formula based on research:
 * - Bayesian prior: 10 virtual samples at 0.5
 * - Time decay: 40% weight on recent 30-day performance
 * - Override penalty: 5% per override, max 30%
 * - Anomaly penalty: up to 20% for anomalies within 30 days
 *
 * @param input - Trust score input parameters
 * @returns Trust score between 0 and 1
 */
export function calculateTrustScore(input: TrustScoreInput): number {
  const totalActions = input.successfulExecutions + input.failedExecutions;

  // Bayesian prior (assume 0.5 base reliability)
  const priorWeight = 10; // Virtual samples
  const priorSuccess = 5;

  // Bayesian average
  const bayesianScore =
    (input.successfulExecutions + priorSuccess) / (totalActions + priorWeight);

  // Time decay: weight recent performance (30-day window)
  const recencyWeight = 0.4;
  const weightedScore =
    (1 - recencyWeight) * bayesianScore +
    recencyWeight * input.recentSuccessRate;

  // Penalty for human overrides (each override reduces trust)
  const overridePenalty = Math.min(0.3, input.humanOverrides * 0.05);

  // Anomaly recency penalty (recent anomalies hurt more)
  let anomalyPenalty = 0;
  if (input.lastAnomalyDays !== null && input.lastAnomalyDays < 30) {
    anomalyPenalty = 0.2 * (1 - input.lastAnomalyDays / 30);
  }

  const finalScore = Math.max(
    0,
    Math.min(1, weightedScore - overridePenalty - anomalyPenalty)
  );

  return finalScore;
}

/**
 * Map trust score (0-1) to autonomy level (1-5)
 *
 * @param trustScore - Score between 0 and 1
 * @returns Autonomy level 1-5
 */
export function getAutonomyLevel(trustScore: number): AutonomyLevel {
  if (trustScore >= 0.95) return 5; // Full autonomy
  if (trustScore >= 0.85) return 4; // High autonomy
  if (trustScore >= 0.7) return 3; // Medium autonomy
  if (trustScore >= 0.5) return 2; // Low autonomy
  return 1; // Minimal autonomy (always HITL)
}

/**
 * Update trust metrics after an action execution
 *
 * @param agentId - Agent ID
 * @param skillId - Skill ID
 * @param domain - Domain
 * @param success - Whether the execution succeeded
 * @param isOverride - Whether a human override occurred
 */
export function updateTrustMetrics(
  agentId: string,
  skillId: string,
  domain: string,
  success: boolean,
  isOverride: boolean
): void {
  const db = getDatabase();

  // Check if record exists
  const existing = getTrustScore(agentId, skillId, domain);

  if (!existing) {
    // Create new trust score record
    const id = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO trust_scores (
        id, agent_id, skill_id, domain,
        successful_executions, failed_executions, human_overrides,
        reliability_score, autonomy_level, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      agentId,
      skillId,
      domain,
      success ? 1 : 0,
      success ? 0 : 1,
      isOverride ? 1 : 0,
      0.5, // Initial reliability score (Bayesian prior)
      1, // Initial autonomy level (minimal)
      new Date().toISOString()
    );
    return;
  }

  // Update existing record
  const newSuccessful = existing.successfulExecutions + (success ? 1 : 0);
  const newFailed = existing.failedExecutions + (success ? 0 : 1);
  const newOverrides = existing.humanOverrides + (isOverride ? 1 : 0);

  // Get recent success rate
  const recentRate = getRecentSuccessRate(agentId, skillId, domain, 30);

  // Calculate days since last anomaly
  let lastAnomalyDays: number | null = null;
  if (existing.lastAnomaly) {
    const anomalyDate = new Date(existing.lastAnomaly);
    const now = new Date();
    lastAnomalyDays = Math.floor(
      (now.getTime() - anomalyDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Calculate new trust score
  const newScore = calculateTrustScore({
    successfulExecutions: newSuccessful,
    failedExecutions: newFailed,
    humanOverrides: newOverrides,
    lastAnomalyDays,
    recentSuccessRate: recentRate,
  });

  const newAutonomy = getAutonomyLevel(newScore);

  // Determine auto-approve and human review requirements
  const canAutoApprove = newAutonomy >= 4;
  const requiresHumanReview = newAutonomy <= 2;

  db.prepare(
    `
    UPDATE trust_scores
    SET
      successful_executions = ?,
      failed_executions = ?,
      human_overrides = ?,
      reliability_score = ?,
      autonomy_level = ?,
      can_auto_approve = ?,
      requires_human_review = ?,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    newSuccessful,
    newFailed,
    newOverrides,
    newScore,
    newAutonomy,
    canAutoApprove ? 1 : 0,
    requiresHumanReview ? 1 : 0,
    new Date().toISOString(),
    existing.id
  );
}

/**
 * Record an anomaly for an agent/skill/domain
 *
 * @param agentId - Agent ID
 * @param skillId - Skill ID
 * @param domain - Domain
 */
export function recordAnomaly(
  agentId: string,
  skillId: string,
  domain: string
): void {
  const db = getDatabase();
  const existing = getTrustScore(agentId, skillId, domain);

  if (!existing) {
    // Create new record with anomaly
    const id = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO trust_scores (
        id, agent_id, skill_id, domain,
        last_anomaly, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(id, agentId, skillId, domain, new Date().toISOString(), new Date().toISOString());
    return;
  }

  db.prepare(
    `
    UPDATE trust_scores
    SET last_anomaly = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(new Date().toISOString(), new Date().toISOString(), existing.id);
}

/**
 * Get success rate for recent period from audit logs
 *
 * Note: This queries the audit_logs table for recent actions
 * to calculate success rate within the window.
 *
 * @param agentId - Agent ID
 * @param skillId - Skill ID
 * @param domain - Domain
 * @param days - Number of days to look back (default 30)
 * @returns Success rate between 0 and 1
 */
export function getRecentSuccessRate(
  agentId: string,
  skillId: string,
  domain: string,
  days: number = 30
): number {
  const db = getDatabase();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffIso = cutoffDate.toISOString();

  // Query audit logs for recent actions
  // action_type 'task_completed' = success, 'task_failed' = failure
  const result = db
    .prepare(
      `
    SELECT
      SUM(CASE WHEN action_type = 'task_completed' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN action_type = 'task_failed' THEN 1 ELSE 0 END) as failures
    FROM audit_logs
    WHERE agent_id = ?
      AND timestamp >= ?
      AND action_detail LIKE '%' || ? || '%'
      AND action_detail LIKE '%' || ? || '%'
  `
    )
    .get(agentId, cutoffIso, skillId, domain) as {
    successes: number | null;
    failures: number | null;
  };

  const successes = result?.successes || 0;
  const failures = result?.failures || 0;
  const total = successes + failures;

  if (total === 0) {
    // No recent data, return Bayesian prior
    return 0.5;
  }

  return successes / total;
}

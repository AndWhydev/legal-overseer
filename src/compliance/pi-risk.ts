/**
 * 4.2 — Professional Indemnity risk scorer.
 *
 * Computes a 1-10 risk score for every matter at open / facts-change.
 * Factors:
 *   - matter type baseline (litigation > commercial > conveyancing)
 *   - client sophistication
 *   - transaction value
 *   - time pressure
 *   - complexity of issues
 *   - number of parties
 *   - jurisdiction complexity
 * Score ≥7 flags senior-partner review.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getMatterById } from '../db/repositories/matters.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('PIRisk');

export interface PIRiskAssessment {
  id: string;
  matter_id: string;
  risk_score: number;
  risk_factors_json: string;
  mitigation_steps: string;
  senior_review_flagged: number;
  computed_at: string;
}

export interface PIRiskFactors {
  matterTypeBaseline: number;
  clientSophistication: 'low' | 'medium' | 'high';
  transactionValueAud: number;
  timePressureDays: number | null;
  complexity: 'simple' | 'medium' | 'complex';
  numberOfParties: number;
  multiJurisdiction: boolean;
}

const MATTER_TYPE_BASELINE: Record<string, number> = {
  litigation: 6, commercial: 4, contract: 3, employment: 4, estates: 3,
  family: 5, property: 3, criminal: 6, immigration: 4, regulatory: 5,
  wills: 2, unclassified: 4,
};

export function computePIRisk(matterId: string, factors: Partial<PIRiskFactors>): PIRiskAssessment {
  const matter = getMatterById(matterId);
  if (!matter) throw new Error(`matter ${matterId} not found`);

  const baseline = factors.matterTypeBaseline ?? MATTER_TYPE_BASELINE[matter.matter_type] ?? 4;
  let score = baseline;

  if (factors.clientSophistication === 'low') score += 1;
  if (factors.clientSophistication === 'high') score -= 0.5;
  if ((factors.transactionValueAud ?? 0) > 1_000_000) score += 1.5;
  else if ((factors.transactionValueAud ?? 0) > 250_000) score += 0.5;
  if (factors.timePressureDays != null && factors.timePressureDays <= 7) score += 1;
  if (factors.complexity === 'complex') score += 1.5;
  else if (factors.complexity === 'simple') score -= 0.5;
  if ((factors.numberOfParties ?? 2) > 4) score += 1;
  if (factors.multiJurisdiction) score += 1;

  const final = Math.max(1, Math.min(10, Math.round(score)));
  const flagged = final >= 7 ? 1 : 0;
  const mitigation = buildMitigation(final, factors);
  const factorsRecord = {
    matterTypeBaseline: baseline,
    clientSophistication: factors.clientSophistication ?? null,
    transactionValueAud: factors.transactionValueAud ?? null,
    timePressureDays: factors.timePressureDays ?? null,
    complexity: factors.complexity ?? null,
    numberOfParties: factors.numberOfParties ?? null,
    multiJurisdiction: factors.multiJurisdiction ?? null,
  };

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO pi_risk_assessments
       (id, matter_id, risk_score, risk_factors_json, mitigation_steps,
        senior_review_flagged, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    final,
    JSON.stringify(factorsRecord),
    mitigation,
    flagged,
    now,
  );

  if (flagged && process.env.ADMIN_EMAIL) {
    sendNotification(
      `[PI risk] ${matter.matter_number} scored ${final}/10`,
      `<p>Matter <b>${matter.matter_number} — ${matter.title}</b> has been scored at <b>${final}/10</b> for professional indemnity risk.</p><p>${mitigation.replace(/\n/g, '<br>')}</p>`,
      process.env.ADMIN_EMAIL,
    ).catch(() => undefined);
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: 'pi-risk-system',
    action: 'pi_risk.compute',
    detail: `score ${final}/10${flagged ? ' (senior review flagged)' : ''}`,
    refTable: 'pi_risk_assessments',
    refId: id,
    metadata: { score: final, flagged: !!flagged },
  });
  return getRiskAssessment(id) as PIRiskAssessment;
}

function buildMitigation(score: number, factors: Partial<PIRiskFactors>): string {
  const out: string[] = [];
  if (score >= 7) out.push('- Senior partner review required at all key stages.');
  if ((factors.transactionValueAud ?? 0) > 1_000_000) out.push('- Confirm PI cover limit exceeds transaction value.');
  if (factors.complexity === 'complex') out.push('- File memorandum of legal reasoning before any binding step.');
  if (factors.timePressureDays != null && factors.timePressureDays <= 7) out.push('- Document time-pressure constraint in the file.');
  if (factors.multiJurisdiction) out.push('- Obtain jurisdiction comparison memo before strategy lock-in.');
  if (!out.length) out.push('- Standard file review schedule applies.');
  return out.join('\n');
}

export function getRiskAssessment(id: string): PIRiskAssessment | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM pi_risk_assessments WHERE id = ?').get(id) as
      | PIRiskAssessment
      | undefined) ?? null
  );
}

export function getLatestRiskAssessment(matterId: string): PIRiskAssessment | null {
  const db = getDatabase();
  return (
    (db
      .prepare(
        `SELECT * FROM pi_risk_assessments WHERE matter_id = ? ORDER BY computed_at DESC LIMIT 1`,
      )
      .get(matterId) as PIRiskAssessment | undefined) ?? null
  );
}

export function listHighRiskMatters(): PIRiskAssessment[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT a.* FROM pi_risk_assessments a
       JOIN (
         SELECT matter_id, MAX(computed_at) AS most_recent
         FROM pi_risk_assessments GROUP BY matter_id
       ) latest ON latest.matter_id = a.matter_id AND latest.most_recent = a.computed_at
       WHERE a.risk_score >= 7
       ORDER BY a.risk_score DESC`,
    )
    .all() as PIRiskAssessment[];
}

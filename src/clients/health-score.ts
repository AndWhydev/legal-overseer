/**
 * 3.1 — Client Health Score.
 *
 * Calculated weekly per active client. Combines payment history,
 * responsiveness to requests, complexity trend, relationship length,
 * and satisfaction survey scores. Green ≥70, amber 40-69, red <40.
 * Score drop below 50 triggers a relationship partner notification.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { listClients, getClient, type Client } from './repo.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('HealthScore');

export interface ClientHealthScore {
  id: string;
  client_id: string;
  score: number;
  payment_score: number;
  responsiveness_score: number;
  complexity_trend_score: number;
  relationship_length_score: number;
  satisfaction_score: number;
  breakdown_json: string;
  computed_at: string;
}

export interface ScoreBreakdown {
  payment: { weight: number; raw: number; explanation: string };
  responsiveness: { weight: number; raw: number; explanation: string };
  complexity: { weight: number; raw: number; explanation: string };
  relationship: { weight: number; raw: number; explanation: string };
  satisfaction: { weight: number; raw: number; explanation: string };
}

const WEIGHTS = {
  payment: 0.30,
  responsiveness: 0.25,
  complexity: 0.15,
  relationship: 0.15,
  satisfaction: 0.15,
};

function computePaymentScore(clientId: string): { raw: number; explanation: string } {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT i.status, i.due_date, i.total_aud,
              COALESCE(SUM(p.amount_aud), 0) AS paid
       FROM invoices i
       LEFT JOIN invoice_payments p ON p.invoice_id = i.id
       WHERE i.client_id = ?
       GROUP BY i.id`,
    )
    .all(clientId) as { status: string; due_date: string; total_aud: number; paid: number }[];

  if (!rows.length) return { raw: 75, explanation: 'No invoice history yet.' };
  const now = new Date().toISOString();
  let onTime = 0;
  let late = 0;
  let unpaid = 0;
  for (const r of rows) {
    if (r.paid >= r.total_aud - 0.01) {
      // Paid: was it paid before due date?
      if (r.status === 'paid') onTime += 1;
      else late += 1;
    } else if (r.due_date < now) {
      unpaid += 1;
    } else {
      onTime += 0.5;
    }
  }
  const total = onTime + late + unpaid;
  if (total === 0) return { raw: 75, explanation: 'No closed invoice history.' };
  const ratio = onTime / total;
  return {
    raw: Math.round(ratio * 100),
    explanation: `${Math.round(ratio * 100)}% on time; ${late} late, ${unpaid} unpaid past due.`,
  };
}

function computeResponsivenessScore(clientId: string): { raw: number; explanation: string } {
  const db = getDatabase();
  const requests = db
    .prepare(
      `SELECT status, deadline_date, completed_at, created_at
       FROM document_requests WHERE client_id = ?`,
    )
    .all(clientId) as { status: string; deadline_date: string; completed_at: string | null; created_at: string }[];
  if (!requests.length) return { raw: 70, explanation: 'No document requests on record.' };
  let onTime = 0;
  let late = 0;
  let outstanding = 0;
  const now = new Date().toISOString();
  for (const r of requests) {
    if (r.completed_at) {
      if (r.completed_at <= r.deadline_date) onTime += 1;
      else late += 1;
    } else if (r.deadline_date < now) {
      outstanding += 1;
    } else {
      onTime += 0.5;
    }
  }
  const total = requests.length;
  const ratio = (onTime + 0.3 * late) / total;
  return {
    raw: Math.round(ratio * 100),
    explanation: `${onTime}/${total} requests on time; ${late} late, ${outstanding} outstanding.`,
  };
}

function computeComplexityTrend(clientId: string): { raw: number; explanation: string } {
  const db = getDatabase();
  const matters = db
    .prepare(
      `SELECT matter_type, opened_at FROM matters WHERE client_id = ? ORDER BY opened_at`,
    )
    .all(clientId) as { matter_type: string; opened_at: string }[];
  if (!matters.length) return { raw: 60, explanation: 'No matters yet.' };
  // Naive: more matters = healthier relationship (capped).
  const raw = Math.min(100, 40 + matters.length * 10);
  return {
    raw,
    explanation: `${matters.length} matter(s) opened with this client.`,
  };
}

function computeRelationshipLength(client: Client): { raw: number; explanation: string } {
  const opened = new Date(client.created_at).getTime();
  const years = (Date.now() - opened) / (365.25 * 24 * 3600 * 1000);
  const raw = Math.min(100, 30 + Math.floor(years * 15));
  return {
    raw,
    explanation: `${years.toFixed(1)} years as a client.`,
  };
}

function computeSatisfaction(clientId: string): { raw: number; explanation: string } {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT overall_satisfaction, likelihood_to_recommend
       FROM satisfaction_surveys
       WHERE client_id = ? AND responded_at IS NOT NULL`,
    )
    .all(clientId) as { overall_satisfaction: number | null; likelihood_to_recommend: number | null }[];
  if (!rows.length) return { raw: 70, explanation: 'No satisfaction surveys completed.' };
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (typeof r.overall_satisfaction === 'number') {
      sum += r.overall_satisfaction * 20;
      n += 1;
    }
    if (typeof r.likelihood_to_recommend === 'number') {
      sum += r.likelihood_to_recommend * 10;
      n += 1;
    }
  }
  const avg = n ? sum / n : 70;
  return {
    raw: Math.round(avg),
    explanation: `Average across ${rows.length} survey response(s).`,
  };
}

export function computeClientHealthScore(clientId: string): ClientHealthScore {
  const client = getClient(clientId);
  if (!client) throw new Error(`client ${clientId} not found`);
  const breakdown: ScoreBreakdown = {
    payment: { weight: WEIGHTS.payment, ...computePaymentScore(clientId) },
    responsiveness: { weight: WEIGHTS.responsiveness, ...computeResponsivenessScore(clientId) },
    complexity: { weight: WEIGHTS.complexity, ...computeComplexityTrend(clientId) },
    relationship: { weight: WEIGHTS.relationship, ...computeRelationshipLength(client) },
    satisfaction: { weight: WEIGHTS.satisfaction, ...computeSatisfaction(clientId) },
  };
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        breakdown.payment.raw * breakdown.payment.weight +
          breakdown.responsiveness.raw * breakdown.responsiveness.weight +
          breakdown.complexity.raw * breakdown.complexity.weight +
          breakdown.relationship.raw * breakdown.relationship.weight +
          breakdown.satisfaction.raw * breakdown.satisfaction.weight,
      ),
    ),
  );

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO client_health_scores
       (id, client_id, score, payment_score, responsiveness_score,
        complexity_trend_score, relationship_length_score,
        satisfaction_score, breakdown_json, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    clientId,
    score,
    breakdown.payment.raw,
    breakdown.responsiveness.raw,
    breakdown.complexity.raw,
    breakdown.relationship.raw,
    breakdown.satisfaction.raw,
    JSON.stringify(breakdown),
    now,
  );

  // Alert if score dropped below 50.
  if (score < 50 && client.relationship_partner_email) {
    sendNotification(
      `Client health alert: ${client.full_name} score ${score}/100`,
      `<p>The weekly client health score for <b>${client.full_name}</b> has dropped to <b>${score}/100</b>.</p><pre>${JSON.stringify(breakdown, null, 2)}</pre><p>Review the client relationship and consider intervention.</p>`,
      client.relationship_partner_email,
    ).catch((err) => logger.warn(`alert email failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  appendLegalAudit({
    matterId: null,
    actorId: 'health-score-system',
    action: 'client.health_score',
    detail: `${client.full_name}: ${score}/100`,
    refTable: 'client_health_scores',
    refId: id,
    metadata: { score, alert: score < 50 },
  });

  return getClientHealthScore(id) as ClientHealthScore;
}

export function getClientHealthScore(id: string): ClientHealthScore | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM client_health_scores WHERE id = ?').get(id) as
      | ClientHealthScore
      | undefined) ?? null
  );
}

export function getLatestHealthScore(clientId: string): ClientHealthScore | null {
  const db = getDatabase();
  return (
    (db
      .prepare(
        `SELECT * FROM client_health_scores WHERE client_id = ?
         ORDER BY computed_at DESC LIMIT 1`,
      )
      .get(clientId) as ClientHealthScore | undefined) ?? null
  );
}

export function listHealthScoreHistory(clientId: string, limit = 30): ClientHealthScore[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM client_health_scores WHERE client_id = ?
       ORDER BY computed_at DESC LIMIT ?`,
    )
    .all(clientId, limit) as ClientHealthScore[];
}

export function computeAllHealthScores(): { computed: number } {
  let count = 0;
  for (const c of listClients('active')) {
    try {
      computeClientHealthScore(c.id);
      count += 1;
    } catch (err) {
      logger.warn(`health score for ${c.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  logger.info(`computed ${count} client health scores`);
  return { computed: count };
}

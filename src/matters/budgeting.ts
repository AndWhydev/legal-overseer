/**
 * 3.6 — Matter budgeting.
 *
 * Per-matter budget covering estimated hours, disbursements, and total
 * fee. Real-time progress bar; alerts at 75% / 90% consumed. Closing
 * budget analysis when matter ends.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getMatterById } from '../db/repositories/matters.js';
import { summariseMatterBilling } from '../compliance/billing.js';
import { sendNotification } from '../email/notifier.js';

const logger = createSafeLogger('MatterBudget');

const FIRM_RATE_AUD = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');

export interface MatterBudget {
  id: string;
  matter_id: string;
  estimated_hours: number;
  estimated_disbursements_aud: number;
  estimated_total_aud: number;
  notes: string | null;
  set_by: string;
  alert_75_sent_at: string | null;
  alert_90_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatterDisbursement {
  id: string;
  matter_id: string;
  description: string;
  amount_aud: number;
  category: string | null;
  incurred_at: string;
  recorded_by: string;
}

export interface SetBudgetInput {
  matterId: string;
  estimatedHours: number;
  estimatedDisbursementsAud: number;
  estimatedTotalAud: number;
  notes?: string;
  acting: string;
}

export function setMatterBudget(input: SetBudgetInput): MatterBudget {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const db = getDatabase();
  const existing = db
    .prepare('SELECT id FROM matter_budgets WHERE matter_id = ?')
    .get(input.matterId) as { id: string } | undefined;
  const now = new Date().toISOString();
  let id: string;
  if (existing) {
    id = existing.id;
    db.prepare(
      `UPDATE matter_budgets SET
         estimated_hours = ?, estimated_disbursements_aud = ?,
         estimated_total_aud = ?, notes = ?, set_by = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.estimatedHours,
      input.estimatedDisbursementsAud,
      input.estimatedTotalAud,
      input.notes ?? null,
      input.acting,
      now,
      id,
    );
  } else {
    id = randomUUID();
    db.prepare(
      `INSERT INTO matter_budgets
         (id, matter_id, estimated_hours, estimated_disbursements_aud,
          estimated_total_aud, notes, set_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.matterId,
      input.estimatedHours,
      input.estimatedDisbursementsAud,
      input.estimatedTotalAud,
      input.notes ?? null,
      input.acting,
      now,
      now,
    );
  }
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.acting,
    action: 'budget.set',
    detail: `${input.estimatedHours}h / AUD ${input.estimatedTotalAud}`,
    refTable: 'matter_budgets',
    refId: id,
  });
  return getMatterBudget(input.matterId) as MatterBudget;
}

export function getMatterBudget(matterId: string): MatterBudget | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM matter_budgets WHERE matter_id = ?').get(matterId) as
      | MatterBudget
      | undefined) ?? null
  );
}

export interface RecordDisbursementInput {
  matterId: string;
  description: string;
  amountAud: number;
  category?: string;
  acting: string;
}

export function recordDisbursement(input: RecordDisbursementInput): MatterDisbursement {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO matter_disbursements
       (id, matter_id, description, amount_aud, category, incurred_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.matterId,
    input.description,
    input.amountAud,
    input.category ?? null,
    now,
    input.acting,
  );
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.acting,
    action: 'disbursement.record',
    detail: `${input.description} AUD ${input.amountAud}`,
    refTable: 'matter_disbursements',
    refId: id,
  });
  return db.prepare('SELECT * FROM matter_disbursements WHERE id = ?').get(id) as MatterDisbursement;
}

export function listMatterDisbursements(matterId: string): MatterDisbursement[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM matter_disbursements WHERE matter_id = ? ORDER BY incurred_at DESC`)
    .all(matterId) as MatterDisbursement[];
}

export interface BudgetStatus {
  budget: MatterBudget | null;
  actualHours: number;
  actualDisbursementsAud: number;
  actualFeeAud: number;
  actualTotalAud: number;
  percentageConsumed: number | null;
  shouldAlert75: boolean;
  shouldAlert90: boolean;
  overBudget: boolean;
}

export function getBudgetStatus(matterId: string): BudgetStatus {
  const budget = getMatterBudget(matterId);
  const billing = summariseMatterBilling(matterId);
  const actualHours = billing.lawyerSeconds / 3600;
  const actualFeeAud = actualHours * FIRM_RATE_AUD;
  const disbursements = listMatterDisbursements(matterId);
  const actualDisbursementsAud = disbursements.reduce((s, d) => s + d.amount_aud, 0);
  const actualTotalAud = actualFeeAud + actualDisbursementsAud;

  let percentageConsumed: number | null = null;
  let shouldAlert75 = false;
  let shouldAlert90 = false;
  let overBudget = false;
  if (budget && budget.estimated_total_aud > 0) {
    percentageConsumed = Math.round((actualTotalAud / budget.estimated_total_aud) * 100);
    overBudget = percentageConsumed >= 100;
    shouldAlert75 = percentageConsumed >= 75 && !budget.alert_75_sent_at;
    shouldAlert90 = percentageConsumed >= 90 && !budget.alert_90_sent_at;
  }
  return {
    budget,
    actualHours,
    actualDisbursementsAud,
    actualFeeAud,
    actualTotalAud,
    percentageConsumed,
    shouldAlert75,
    shouldAlert90,
    overBudget,
  };
}

export function dispatchBudgetAlerts(): { sent: number } {
  const db = getDatabase();
  const all = db.prepare('SELECT matter_id FROM matter_budgets').all() as { matter_id: string }[];
  let sent = 0;
  for (const { matter_id } of all) {
    const status = getBudgetStatus(matter_id);
    if (!status.shouldAlert75 && !status.shouldAlert90) continue;
    const matter = getMatterById(matter_id);
    if (!matter || !matter.responsible_lawyer_email) continue;
    const threshold = status.shouldAlert90 ? '90%' : '75%';
    sendNotification(
      `[Budget alert] ${matter.matter_number} at ${threshold} of budget`,
      `<p>Matter <b>${matter.matter_number} — ${matter.title}</b> has reached ${status.percentageConsumed}% of the budgeted AUD ${status.budget?.estimated_total_aud ?? 0}.</p><p>Actual fee: AUD ${status.actualFeeAud.toFixed(2)}<br/>Actual disbursements: AUD ${status.actualDisbursementsAud.toFixed(2)}</p>`,
      matter.responsible_lawyer_email,
    ).catch(() => undefined);
    const now = new Date().toISOString();
    if (status.shouldAlert90) {
      db.prepare(`UPDATE matter_budgets SET alert_90_sent_at = ? WHERE matter_id = ?`).run(now, matter_id);
    } else {
      db.prepare(`UPDATE matter_budgets SET alert_75_sent_at = ? WHERE matter_id = ?`).run(now, matter_id);
    }
    appendLegalAudit({
      matterId: matter_id,
      actorId: 'budget-system',
      action: 'budget.alert',
      detail: `${threshold} threshold`,
      refTable: 'matter_budgets',
      refId: status.budget?.id ?? null,
    });
    sent += 1;
  }
  if (sent) logger.info(`dispatched ${sent} budget alerts`);
  return { sent };
}

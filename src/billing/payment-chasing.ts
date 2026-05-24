/**
 * 8.5 — Payment chasing.
 *
 * Tracks overdue invoices. Drafts reminders at day 7/14/30 overdue.
 * Receipt acknowledgments drafted when payment recorded.
 * All drafts go through the review queue.
 */

import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById } from '../db/repositories/matters.js';
import type { Invoice } from './invoice-generator.js';

const logger = createSafeLogger('PaymentChasing');

export interface OverdueInvoice {
  invoice: Invoice;
  daysOverdue: number;
  matterNumber: string;
  clientName: string;
}

export function listOverdueInvoices(): OverdueInvoice[] {
  const db = getDatabase();
  const now = new Date().toISOString().slice(0, 10);
  const rows = db
    .prepare(
      `SELECT * FROM client_invoices
       WHERE status IN ('sent', 'overdue') AND due_date < ? AND amount_paid_aud < total_aud
       ORDER BY due_date`,
    )
    .all(now) as Invoice[];
  const out: OverdueInvoice[] = [];
  for (const r of rows) {
    const m = getMatterById(r.matter_id);
    if (!m) continue;
    const days = Math.floor(
      (new Date(now).getTime() - new Date(r.due_date).getTime()) / (24 * 3600 * 1000),
    );
    out.push({ invoice: r, daysOverdue: days, matterNumber: m.matter_number, clientName: m.client_name });
  }
  return out;
}

function reminderBody(kind: '7d' | '14d' | '30d', inv: Invoice, matterNumber: string, clientName: string): string {
  const due = inv.due_date;
  const owing = (inv.total_aud - inv.amount_paid_aud).toFixed(2);
  if (kind === '7d') {
    return wrapWithDisclaimer(`# Payment reminder — Invoice ${inv.invoice_number}

Dear ${clientName},

A friendly reminder that invoice ${inv.invoice_number} for matter
${matterNumber} (AUD ${owing} outstanding) was due on ${due}.

Please arrange payment when convenient, or contact us if you have any
queries about the invoice.

Kind regards,
[YOUR NAME]`);
  }
  if (kind === '14d') {
    return wrapWithDisclaimer(`# Second payment reminder — Invoice ${inv.invoice_number}

Dear ${clientName},

Our records show invoice ${inv.invoice_number} (AUD ${owing}, due
${due}) remains unpaid. A copy is attached.

Please arrange payment within the next 7 days, or contact us if you
are unable to do so.

Kind regards,
[YOUR NAME]`);
  }
  return wrapWithDisclaimer(`# Final notice — Invoice ${inv.invoice_number}

Dear ${clientName},

Invoice ${inv.invoice_number} (AUD ${owing}, due ${due}) is now
significantly overdue. Unless payment is received within 14 days, we
may need to refer this matter to our debt-recovery process which will
incur additional costs.

Please contact us urgently to discuss.

Kind regards,
[YOUR NAME]`);
}

export function dispatchReminders(acting: string): { drafted: number } {
  const overdue = listOverdueInvoices();
  const db = getDatabase();
  let drafted = 0;
  for (const { invoice, daysOverdue, matterNumber, clientName } of overdue) {
    let kind: '7d' | '14d' | '30d' | null = null;
    if (daysOverdue >= 30 && invoice.reminder_count < 3) kind = '30d';
    else if (daysOverdue >= 14 && invoice.reminder_count < 2) kind = '14d';
    else if (daysOverdue >= 7 && invoice.reminder_count < 1) kind = '7d';
    if (!kind) continue;
    const body = reminderBody(kind, invoice, matterNumber, clientName);
    enqueueForReview({
      matterId: invoice.matter_id,
      matterNumber,
      skillId: 'payment_chasing',
      outputKind: 'client_email',
      title: `Payment reminder (${kind}) — ${invoice.invoice_number}`,
      bodyMarkdown: body,
      metadata: { invoice_id: invoice.id, days_overdue: daysOverdue, kind },
    });
    db.prepare(
      `UPDATE client_invoices SET reminder_count = reminder_count + 1, last_reminder_at = ?, status = ? WHERE id = ?`,
    ).run(new Date().toISOString(), daysOverdue >= 30 ? 'overdue' : invoice.status, invoice.id);
    appendLegalAudit({
      matterId: invoice.matter_id,
      actorId: acting,
      action: 'invoice.reminder_drafted',
      detail: `${invoice.invoice_number} ${kind} (${daysOverdue}d overdue)`,
      refTable: 'invoices',
      refId: invoice.id,
    });
    drafted += 1;
  }
  if (drafted) logger.info(`payment chasing: ${drafted} reminders drafted`);
  return { drafted };
}

export function draftPaymentReceipt(invoiceId: string, acting: string): void {
  const db = getDatabase();
  const inv = db.prepare('SELECT * FROM client_invoices WHERE id = ?').get(invoiceId) as Invoice | undefined;
  if (!inv) return;
  const matter = getMatterById(inv.matter_id);
  if (!matter) return;
  const body = wrapWithDisclaimer(`# Payment received — Invoice ${inv.invoice_number}

Dear ${matter.client_name},

Thank you — we confirm receipt of payment for invoice ${inv.invoice_number}
(AUD ${inv.total_aud.toFixed(2)}). Your account is now up to date.

Kind regards,
[YOUR NAME]`);
  enqueueForReview({
    matterId: inv.matter_id,
    matterNumber: matter.matter_number,
    skillId: 'payment_chasing',
    outputKind: 'client_email',
    title: `Payment receipt — ${inv.invoice_number}`,
    bodyMarkdown: body,
    metadata: { invoice_id: inv.id, kind: 'receipt' },
  });
  appendLegalAudit({
    matterId: inv.matter_id,
    actorId: acting,
    action: 'invoice.receipt_drafted',
    detail: inv.invoice_number,
    refTable: 'invoices',
    refId: inv.id,
  });
}

export interface AgeingReport {
  current: { count: number; totalAud: number };
  d1_30: { count: number; totalAud: number };
  d31_60: { count: number; totalAud: number };
  d61_90: { count: number; totalAud: number };
  d90_plus: { count: number; totalAud: number };
}

export function ageingReport(): AgeingReport {
  const overdue = listOverdueInvoices();
  const report: AgeingReport = {
    current: { count: 0, totalAud: 0 },
    d1_30: { count: 0, totalAud: 0 },
    d31_60: { count: 0, totalAud: 0 },
    d61_90: { count: 0, totalAud: 0 },
    d90_plus: { count: 0, totalAud: 0 },
  };
  const db = getDatabase();
  const currentRows = db
    .prepare(
      `SELECT * FROM client_invoices WHERE status IN ('sent', 'overdue') AND due_date >= ?`,
    )
    .all(new Date().toISOString().slice(0, 10)) as Invoice[];
  for (const r of currentRows) {
    report.current.count += 1;
    report.current.totalAud += r.total_aud - r.amount_paid_aud;
  }
  for (const o of overdue) {
    const owing = o.invoice.total_aud - o.invoice.amount_paid_aud;
    if (o.daysOverdue <= 30) {
      report.d1_30.count += 1;
      report.d1_30.totalAud += owing;
    } else if (o.daysOverdue <= 60) {
      report.d31_60.count += 1;
      report.d31_60.totalAud += owing;
    } else if (o.daysOverdue <= 90) {
      report.d61_90.count += 1;
      report.d61_90.totalAud += owing;
    } else {
      report.d90_plus.count += 1;
      report.d90_plus.totalAud += owing;
    }
  }
  return report;
}

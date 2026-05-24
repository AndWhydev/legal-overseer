/**
 * 8.4 — Invoice generation.
 *
 * Reviews AI activity + lawyer time on a matter and drafts a
 * professional invoice. Lawyer reviews and adjusts time entries
 * before final approval; on approval the invoice goes through the
 * outbound email + Xero push.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { getMatterById, listMatters } from '../db/repositories/matters.js';
import { listMatterBilling } from '../compliance/billing.js';
import { listMatterDisbursements } from '../matters/budgeting.js';

const logger = createSafeLogger('InvoiceGen');

const FIRM_RATE_AUD = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');
const USD_TO_AUD = Number.parseFloat(process.env.USD_TO_AUD ?? '1.5');
const FIRM_ID = process.env.FIRM_ID ?? 'default';
const GST_RATE = Number.parseFloat(process.env.GST_RATE ?? '0.10');

export interface Invoice {
  id: string;
  matter_id: string;
  invoice_number: string;
  client_id: string | null;
  issue_date: string;
  due_date: string;
  subtotal_aud: number;
  gst_aud: number;
  total_aud: number;
  amount_paid_aud: number;
  status: 'draft' | 'pending_approval' | 'sent' | 'paid' | 'overdue' | 'written_off';
  review_id: string | null;
  line_items_json: string;
  trust_balance_aud: number | null;
  notes: string | null;
  sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  xero_invoice_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPriceAud: number;
  totalAud: number;
  date?: string;
}

function nextInvoiceNumber(): string {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT next_number FROM invoice_sequence WHERE firm_id = ?`)
    .get(FIRM_ID) as { next_number: number } | undefined;
  let n = 1;
  if (row) {
    n = row.next_number;
    db.prepare(`UPDATE invoice_sequence SET next_number = ? WHERE firm_id = ?`).run(n + 1, FIRM_ID);
  } else {
    db.prepare(`INSERT INTO invoice_sequence (firm_id, next_number) VALUES (?, ?)`).run(FIRM_ID, 2);
  }
  const year = new Date().getFullYear();
  return `INV-${year}-${n.toString().padStart(5, '0')}`;
}

function summariseAiRuns(matterId: string): LineItem[] {
  const billing = listMatterBilling(matterId);
  const groups = new Map<string, { totalSec: number; totalCostUsd: number; n: number }>();
  for (const b of billing) {
    if (b.kind !== 'ai_run') continue;
    const e = groups.get(b.actor_id) ?? { totalSec: 0, totalCostUsd: 0, n: 0 };
    e.totalSec += b.duration_seconds;
    e.totalCostUsd += b.cost_usd ?? 0;
    e.n += 1;
    groups.set(b.actor_id, e);
  }
  const items: LineItem[] = [];
  for (const [skill, e] of groups) {
    items.push({
      description: `AI-assisted ${skill.replace(/_/g, ' ')} (${e.n} run${e.n === 1 ? '' : 's'}, ${(e.totalSec / 60).toFixed(1)} min)`,
      quantity: 1,
      unitPriceAud: e.totalCostUsd * USD_TO_AUD,
      totalAud: e.totalCostUsd * USD_TO_AUD,
    });
  }
  return items;
}

function summariseLawyerTime(matterId: string): LineItem[] {
  const billing = listMatterBilling(matterId);
  const groups = new Map<string, { totalSec: number; n: number }>();
  for (const b of billing) {
    if (b.kind !== 'lawyer_time') continue;
    const e = groups.get(b.actor_id) ?? { totalSec: 0, n: 0 };
    e.totalSec += b.duration_seconds;
    e.n += 1;
    groups.set(b.actor_id, e);
  }
  const items: LineItem[] = [];
  for (const [lawyer, e] of groups) {
    const hours = e.totalSec / 3600;
    items.push({
      description: `${lawyer} legal services (${hours.toFixed(2)} hours @ AUD ${FIRM_RATE_AUD.toFixed(2)})`,
      quantity: hours,
      unitPriceAud: FIRM_RATE_AUD,
      totalAud: hours * FIRM_RATE_AUD,
    });
  }
  return items;
}

export interface DraftInvoiceInput {
  matterId: string;
  acting: string;
  /** Override line items (the lawyer's adjusted entries). */
  overrideLineItems?: LineItem[];
  dueInDays?: number;
}

export function draftInvoice(input: DraftInvoiceInput): Invoice {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const items =
    input.overrideLineItems ??
    [
      ...summariseLawyerTime(matter.id),
      ...summariseAiRuns(matter.id),
      ...listMatterDisbursements(matter.id).map((d) => ({
        description: `Disbursement: ${d.description}`,
        quantity: 1,
        unitPriceAud: d.amount_aud,
        totalAud: d.amount_aud,
        date: d.incurred_at.slice(0, 10),
      })),
    ];

  const subtotal = items.reduce((s, i) => s + i.totalAud, 0);
  const gst = subtotal * GST_RATE;
  const total = subtotal + gst;
  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + (input.dueInDays ?? 14) * 86400000).toISOString().slice(0, 10);
  const invoiceNumber = nextInvoiceNumber();
  const id = randomUUID();

  const body = wrapWithDisclaimer(`# Tax Invoice ${invoiceNumber}

**Matter:** ${matter.matter_number} — ${matter.title}
**Client:** ${matter.client_name}
**Issue date:** ${issueDate}
**Due date:** ${dueDate}

## Items

${items.map((i) => `- ${i.description}: AUD ${i.totalAud.toFixed(2)}`).join('\n')}

| | |
| --- | ---: |
| Subtotal | AUD ${subtotal.toFixed(2)} |
| GST (10%) | AUD ${gst.toFixed(2)} |
| **Total** | **AUD ${total.toFixed(2)}** |

Payment terms: ${input.dueInDays ?? 14} days net.

Thank you for your business.`);

  const review = enqueueForReview({
    matterId: matter.id,
    matterNumber: matter.matter_number,
    skillId: 'invoice_generator',
    outputKind: 'drafted_document',
    title: `Invoice ${invoiceNumber} — ${matter.matter_number}`,
    bodyMarkdown: body,
    metadata: { kind: 'invoice', invoice_id: id, total_aud: total },
  });

  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO invoices
       (id, matter_id, invoice_number, client_id, issue_date, due_date,
        subtotal_aud, gst_aud, total_aud, amount_paid_aud, status,
        review_id, line_items_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending_approval', ?, ?, ?, ?, ?)`,
  ).run(
    id, matter.id, invoiceNumber,
    matter.client_id ?? null,
    issueDate, dueDate,
    subtotal, gst, total,
    review.id, JSON.stringify(items),
    input.acting, now, now,
  );

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.acting,
    action: 'invoice.draft',
    detail: `${invoiceNumber} (AUD ${total.toFixed(2)})`,
    refTable: 'invoices',
    refId: id,
  });
  return getInvoice(id) as Invoice;
}

export function getInvoice(id: string): Invoice | null {
  const db = getDatabase();
  return (db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as Invoice | undefined) ?? null;
}

export function listMatterInvoices(matterId: string): Invoice[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM invoices WHERE matter_id = ? ORDER BY issue_date DESC`)
    .all(matterId) as Invoice[];
}

export function markInvoiceSent(id: string, acting: string): Invoice {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`UPDATE invoices SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?`).run(
    now,
    now,
    id,
  );
  const inv = getInvoice(id);
  appendLegalAudit({
    matterId: inv?.matter_id ?? null,
    actorId: acting,
    action: 'invoice.sent',
    detail: inv?.invoice_number ?? id,
    refTable: 'invoices',
    refId: id,
  });
  return getInvoice(id) as Invoice;
}

export function recordPayment(invoiceId: string, amountAud: number, method: string, recordedBy: string): void {
  const db = getDatabase();
  const inv = getInvoice(invoiceId);
  if (!inv) throw new Error(`invoice ${invoiceId} not found`);
  db.prepare(
    `INSERT INTO invoice_payments (id, invoice_id, amount_aud, payment_date, method, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), invoiceId, amountAud, new Date().toISOString().slice(0, 10), method, recordedBy);
  const total = (db
    .prepare(`SELECT COALESCE(SUM(amount_aud), 0) AS s FROM invoice_payments WHERE invoice_id = ?`)
    .get(invoiceId) as { s: number }).s;
  const status: Invoice['status'] = total >= inv.total_aud - 0.01 ? 'paid' : 'sent';
  db.prepare(
    `UPDATE invoices SET amount_paid_aud = ?, status = ?, updated_at = ? WHERE id = ?`,
  ).run(total, status, new Date().toISOString(), invoiceId);
  appendLegalAudit({
    matterId: inv.matter_id,
    actorId: recordedBy,
    action: 'invoice.payment_recorded',
    detail: `AUD ${amountAud.toFixed(2)} of ${inv.total_aud.toFixed(2)}`,
    refTable: 'invoices',
    refId: invoiceId,
  });
}

export function generateMonthlyInvoices(yearMonth: string, acting: string): { drafted: number } {
  let drafted = 0;
  for (const m of listMatters('open')) {
    const billing = listMatterBilling(m.id);
    const monthlyEntries = billing.filter((b) => b.created_at.startsWith(yearMonth));
    if (!monthlyEntries.length) continue;
    try {
      draftInvoice({ matterId: m.id, acting });
      drafted += 1;
    } catch (err) {
      logger.warn(`monthly invoice draft for ${m.matter_number} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { drafted };
}

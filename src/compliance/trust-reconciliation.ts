/**
 * 4.6 — Trust account reconciliation.
 *
 * Imports trust account transactions from a bank CSV, matches them
 * against matter records, generates a Law-Society-format
 * reconciliation report, and surfaces unmatched transactions for
 * lawyer review.
 *
 * The CSV format is permissive — column headers are normalised and
 * matched fuzzily. Records are stored in trust_transactions and
 * grouped into trust_reconciliations.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getMatterById, getMatterByNumber } from '../db/repositories/matters.js';

const logger = createSafeLogger('TrustRec');

export type TransactionKind = 'deposit' | 'withdrawal' | 'transfer' | 'interest' | 'fee';

export interface TrustTransaction {
  id: string;
  matter_id: string | null;
  kind: TransactionKind;
  amount_aud: number;
  reference: string | null;
  description: string | null;
  bank_transaction_id: string | null;
  transaction_date: string;
  recorded_at: string;
  reconciled_at: string | null;
  reconciled_by: string | null;
}

export interface RecordTrustTransactionInput {
  matterId?: string | null;
  kind: TransactionKind;
  amountAud: number;
  reference?: string;
  description?: string;
  bankTransactionId?: string;
  transactionDate: string;
}

export function recordTrustTransaction(input: RecordTrustTransactionInput): TrustTransaction {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO trust_transactions
       (id, matter_id, kind, amount_aud, reference, description,
        bank_transaction_id, transaction_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.matterId ?? null,
    input.kind,
    input.amountAud,
    input.reference ?? null,
    input.description ?? null,
    input.bankTransactionId ?? null,
    input.transactionDate,
  );
  appendLegalAudit({
    matterId: input.matterId ?? null,
    actorId: 'trust-system',
    action: `trust.${input.kind}`,
    detail: `AUD ${input.amountAud} ${input.reference ?? ''}`,
    refTable: 'trust_transactions',
    refId: id,
  });
  return db.prepare('SELECT * FROM trust_transactions WHERE id = ?').get(id) as TrustTransaction;
}

export interface CsvRow {
  date: string;
  amount: number;
  description: string;
  reference?: string;
  bankId?: string;
}

const HEADER_ALIASES: Record<keyof CsvRow, RegExp[]> = {
  date: [/^date$/i, /transaction\s*date/i, /posting\s*date/i],
  amount: [/^amount$/i, /^debit\b/i, /^credit\b/i, /^value$/i],
  description: [/description/i, /narration/i, /detail/i],
  reference: [/reference/i, /ref/i],
  bankId: [/transaction\s*id/i, /bank\s*ref/i, /txn\s*id/i],
};

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const headerIndex: Record<keyof CsvRow, number> = {
    date: -1, amount: -1, description: -1, reference: -1, bankId: -1,
  };
  headers.forEach((h, i) => {
    for (const [k, patterns] of Object.entries(HEADER_ALIASES) as [keyof CsvRow, RegExp[]][]) {
      if (patterns.some((p) => p.test(h)) && headerIndex[k] === -1) headerIndex[k] = i;
    }
  });
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: CsvRow = {
      date: cols[headerIndex.date] ?? '',
      amount: Number.parseFloat((cols[headerIndex.amount] ?? '0').replace(/[,$ ]/g, '')) || 0,
      description: cols[headerIndex.description] ?? '',
      reference: headerIndex.reference >= 0 ? cols[headerIndex.reference] : undefined,
      bankId: headerIndex.bankId >= 0 ? cols[headerIndex.bankId] : undefined,
    };
    if (row.date && Number.isFinite(row.amount)) rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function inferKind(row: CsvRow): TransactionKind {
  if (row.amount > 0) return 'deposit';
  if (row.amount < 0) return 'withdrawal';
  return 'transfer';
}

function matchToMatter(row: CsvRow): string | null {
  const refTrials: string[] = [];
  if (row.reference) refTrials.push(row.reference);
  if (row.description) refTrials.push(row.description);
  for (const r of refTrials) {
    const m = r.match(/\b(\d{4}-\d{4})\b/);
    if (m) {
      const matter = getMatterByNumber(m[1]);
      if (matter) return matter.id;
    }
  }
  return null;
}

export interface ImportCsvInput {
  csv: string;
  acting: string;
}

export interface ImportCsvResult {
  imported: number;
  matched: number;
  unmatched: number;
  rows: TrustTransaction[];
}

export function importBankCsv(input: ImportCsvInput): ImportCsvResult {
  const rows = parseCsv(input.csv);
  const out: TrustTransaction[] = [];
  let matched = 0;
  for (const r of rows) {
    const matterId = matchToMatter(r);
    if (matterId) matched += 1;
    const tx = recordTrustTransaction({
      matterId,
      kind: inferKind(r),
      amountAud: Math.abs(r.amount),
      reference: r.reference,
      description: r.description,
      bankTransactionId: r.bankId,
      transactionDate: r.date,
    });
    out.push(tx);
  }
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'trust.import_csv',
    detail: `imported ${out.length} txn, matched ${matched}`,
    refTable: 'trust_transactions',
    refId: null,
    metadata: { imported: out.length, matched, unmatched: out.length - matched },
  });
  logger.info(`trust import: ${out.length} txn, ${matched} matched`);
  return { imported: out.length, matched, unmatched: out.length - matched, rows: out };
}

export interface TrustReconciliation {
  id: string;
  period_start: string;
  period_end: string;
  opening_balance_aud: number;
  closing_balance_aud: number;
  total_deposits_aud: number;
  total_withdrawals_aud: number;
  unmatched_count: number;
  report_markdown: string;
  signed_off_by: string | null;
  signed_off_at: string | null;
  created_at: string;
}

export function generateReconciliation(periodStart: string, periodEnd: string): TrustReconciliation {
  const db = getDatabase();
  const txns = db
    .prepare(
      `SELECT * FROM trust_transactions
       WHERE transaction_date >= ? AND transaction_date <= ?
       ORDER BY transaction_date`,
    )
    .all(periodStart, periodEnd) as TrustTransaction[];
  const opening = (db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_aud ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN kind IN ('withdrawal', 'fee') THEN amount_aud ELSE 0 END), 0)
       AS bal
       FROM trust_transactions WHERE transaction_date < ?`,
    )
    .get(periodStart) as { bal: number }).bal;
  let depositsTotal = 0;
  let withdrawalsTotal = 0;
  let unmatched = 0;
  for (const t of txns) {
    if (t.kind === 'deposit') depositsTotal += t.amount_aud;
    else if (t.kind === 'withdrawal' || t.kind === 'fee') withdrawalsTotal += t.amount_aud;
    if (!t.matter_id) unmatched += 1;
  }
  const closing = opening + depositsTotal - withdrawalsTotal;
  const lines: string[] = [
    `# Trust account reconciliation — ${periodStart} to ${periodEnd}`,
    '',
    `Opening balance: AUD ${opening.toFixed(2)}`,
    `Total deposits:  AUD ${depositsTotal.toFixed(2)}`,
    `Total withdrawals: AUD ${withdrawalsTotal.toFixed(2)}`,
    `Closing balance: AUD ${closing.toFixed(2)}`,
    `Transactions in period: ${txns.length} (${unmatched} unmatched)`,
    '',
    '## Per-matter activity',
    '',
  ];
  const byMatter = new Map<string, { deposits: number; withdrawals: number }>();
  for (const t of txns) {
    if (!t.matter_id) continue;
    const e = byMatter.get(t.matter_id) ?? { deposits: 0, withdrawals: 0 };
    if (t.kind === 'deposit') e.deposits += t.amount_aud;
    else if (t.kind === 'withdrawal' || t.kind === 'fee') e.withdrawals += t.amount_aud;
    byMatter.set(t.matter_id, e);
  }
  for (const [matterId, e] of byMatter) {
    const m = getMatterById(matterId);
    lines.push(
      `- ${m?.matter_number ?? matterId}: +${e.deposits.toFixed(2)} / -${e.withdrawals.toFixed(2)} (balance ${(e.deposits - e.withdrawals).toFixed(2)})`,
    );
  }
  if (unmatched) {
    lines.push('', '## Unmatched transactions requiring lawyer review', '');
    for (const t of txns.filter((tt) => !tt.matter_id)) {
      lines.push(`- ${t.transaction_date} ${t.kind} AUD ${t.amount_aud.toFixed(2)} — "${t.description ?? ''}" (ref: ${t.reference ?? '-'})`);
    }
  }
  const report = lines.join('\n');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO trust_reconciliations
       (id, period_start, period_end, opening_balance_aud, closing_balance_aud,
        total_deposits_aud, total_withdrawals_aud, unmatched_count, report_markdown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, periodStart, periodEnd, opening, closing, depositsTotal, withdrawalsTotal, unmatched, report);

  appendLegalAudit({
    matterId: null,
    actorId: 'trust-reconciliation',
    action: 'trust.reconciliation',
    detail: `${periodStart}..${periodEnd}: closing AUD ${closing.toFixed(2)}`,
    refTable: 'trust_reconciliations',
    refId: id,
    metadata: { unmatched },
  });

  return db
    .prepare('SELECT * FROM trust_reconciliations WHERE id = ?')
    .get(id) as TrustReconciliation;
}

export function signOffReconciliation(id: string, acting: string): TrustReconciliation {
  const db = getDatabase();
  db.prepare(
    `UPDATE trust_reconciliations SET signed_off_by = ?, signed_off_at = ? WHERE id = ?`,
  ).run(acting, new Date().toISOString(), id);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'trust.signoff',
    detail: id,
    refTable: 'trust_reconciliations',
    refId: id,
  });
  return db.prepare('SELECT * FROM trust_reconciliations WHERE id = ?').get(id) as TrustReconciliation;
}

export function listReconciliations(limit = 24): TrustReconciliation[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM trust_reconciliations ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as TrustReconciliation[];
}

export function listMatterTrustLedger(matterId: string): TrustTransaction[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM trust_transactions WHERE matter_id = ? ORDER BY transaction_date`)
    .all(matterId) as TrustTransaction[];
}

export function listUnmatchedTransactions(): TrustTransaction[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM trust_transactions WHERE matter_id IS NULL ORDER BY transaction_date DESC`)
    .all() as TrustTransaction[];
}

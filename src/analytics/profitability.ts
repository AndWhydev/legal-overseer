/**
 * 6.1 — Firm profitability dashboard.
 *
 * Aggregates revenue (paid invoices), AI costs (billing_log), and
 * lawyer billable time → fee revenue across multiple axes: time,
 * practice area, lawyer, matter type, client.
 */

import { getDatabase } from '../db/connection.js';
import { listMatters } from '../db/repositories/matters.js';
import { summariseMatterBilling } from '../compliance/billing.js';

const FIRM_RATE_AUD = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');
const USD_TO_AUD = Number.parseFloat(process.env.USD_TO_AUD ?? '1.5');

export interface ProfitabilityFilters {
  dateStart?: string;
  dateEnd?: string;
  practiceArea?: string;
  lawyerEmail?: string;
  matterType?: string;
  clientName?: string;
}

export interface ProfitabilityRow {
  matterId: string;
  matterNumber: string;
  matterTitle: string;
  matterType: string;
  responsibleLawyer: string | null;
  clientName: string;
  revenueAud: number;
  aiCostAud: number;
  lawyerFeeAud: number;
  grossProfitAud: number;
  marginPct: number;
  openedAt: string;
  closedAt: string | null;
}

export function profitabilityRows(filters: ProfitabilityFilters = {}): ProfitabilityRow[] {
  const matters = listMatters().filter((m) => {
    if (filters.matterType && m.matter_type !== filters.matterType) return false;
    if (filters.lawyerEmail && m.responsible_lawyer_email !== filters.lawyerEmail) return false;
    if (filters.clientName && !m.client_name.toLowerCase().includes(filters.clientName.toLowerCase())) return false;
    if (filters.dateStart && m.opened_at < filters.dateStart) return false;
    if (filters.dateEnd && m.opened_at > filters.dateEnd) return false;
    return true;
  });

  const db = getDatabase();
  const out: ProfitabilityRow[] = [];
  for (const m of matters) {
    const billing = summariseMatterBilling(m.id);
    const revenue = (db
      .prepare(
        `SELECT COALESCE(SUM(amount_aud), 0) AS r FROM client_invoice_payments p
         JOIN client_invoices i ON i.id = p.invoice_id WHERE i.matter_id = ?`,
      )
      .get(m.id) as { r: number }).r;
    const lawyerFee = (billing.lawyerSeconds / 3600) * FIRM_RATE_AUD;
    const aiCost = billing.aiCostUsd * USD_TO_AUD;
    const grossProfit = (revenue || lawyerFee) - aiCost;
    const margin = (revenue || lawyerFee) > 0 ? (grossProfit / (revenue || lawyerFee)) * 100 : 0;
    out.push({
      matterId: m.id,
      matterNumber: m.matter_number,
      matterTitle: m.title,
      matterType: m.matter_type,
      responsibleLawyer: m.responsible_lawyer_email,
      clientName: m.client_name,
      revenueAud: revenue,
      aiCostAud: aiCost,
      lawyerFeeAud: lawyerFee,
      grossProfitAud: grossProfit,
      marginPct: margin,
      openedAt: m.opened_at,
      closedAt: m.closed_at,
    });
  }
  return out;
}

export interface ProfitabilityTotals {
  matterCount: number;
  revenueAud: number;
  aiCostAud: number;
  lawyerFeeAud: number;
  grossProfitAud: number;
  averageFeePerMatter: number;
  averageAiCostPerMatter: number;
}

export function profitabilityTotals(filters: ProfitabilityFilters = {}): ProfitabilityTotals {
  const rows = profitabilityRows(filters);
  const revenue = rows.reduce((s, r) => s + r.revenueAud, 0);
  const aiCost = rows.reduce((s, r) => s + r.aiCostAud, 0);
  const lawyerFee = rows.reduce((s, r) => s + r.lawyerFeeAud, 0);
  return {
    matterCount: rows.length,
    revenueAud: revenue,
    aiCostAud: aiCost,
    lawyerFeeAud: lawyerFee,
    grossProfitAud: revenue - aiCost,
    averageFeePerMatter: rows.length ? revenue / rows.length : 0,
    averageAiCostPerMatter: rows.length ? aiCost / rows.length : 0,
  };
}

export function profitabilityByDimension(
  dimension: 'matterType' | 'lawyer' | 'client',
  filters: ProfitabilityFilters = {},
): { key: string; matterCount: number; revenueAud: number; profitAud: number }[] {
  const rows = profitabilityRows(filters);
  const map = new Map<string, { matterCount: number; revenueAud: number; profitAud: number }>();
  for (const r of rows) {
    const key =
      dimension === 'matterType' ? r.matterType
        : dimension === 'lawyer' ? (r.responsibleLawyer ?? '(unassigned)')
        : r.clientName;
    const e = map.get(key) ?? { matterCount: 0, revenueAud: 0, profitAud: 0 };
    e.matterCount += 1;
    e.revenueAud += r.revenueAud;
    e.profitAud += r.grossProfitAud;
    map.set(key, e);
  }
  return Array.from(map.entries())
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.profitAud - a.profitAud);
}

export function revenueTrendByMonth(months = 12): { ym: string; revenueAud: number }[] {
  const db = getDatabase();
  const out: { ym: string; revenueAud: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
    const r = (db
      .prepare(
        `SELECT COALESCE(SUM(amount_aud), 0) AS r FROM client_invoice_payments
         WHERE substr(payment_date, 1, 7) = ?`,
      )
      .get(ym) as { r: number }).r;
    out.push({ ym, revenueAud: r });
  }
  return out;
}

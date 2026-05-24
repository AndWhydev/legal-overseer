/**
 * 6.3 — Pipeline forecasting.
 *
 * 30/60/90-day revenue forecast based on:
 *  - active matters and estimated completion dates
 *  - historical average fee per matter type
 *  - current matter stage (from billing % of estimate)
 */

import { listMatters } from '../db/repositories/matters.js';
import { summariseMatterBilling } from '../compliance/billing.js';
import { getMatterCostEstimate } from '../cost-estimator/index.js';

const FIRM_RATE_AUD = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');
const USD_TO_AUD = Number.parseFloat(process.env.USD_TO_AUD ?? '1.5');

export interface MatterPipeline {
  matterId: string;
  matterNumber: string;
  matterTitle: string;
  matterType: string;
  estimatedTotalAud: number;
  alreadyBilledAud: number;
  expectedClosingMonth: string;
  remainingAud: number;
  confidence: 'high' | 'medium' | 'low';
}

function predictedClosingMonth(openedAt: string, matterType: string): string {
  // Naive: assume matter closes after typical duration per type.
  const monthsByType: Record<string, number> = {
    litigation: 12, family: 9, criminal: 6, commercial: 4, contract: 2,
    property: 3, estates: 6, employment: 4, immigration: 5, regulatory: 5,
    wills: 1, unclassified: 4,
  };
  const months = monthsByType[matterType] ?? 4;
  const opened = new Date(openedAt);
  const closing = new Date(opened.getFullYear(), opened.getMonth() + months, 1);
  return `${closing.getFullYear()}-${(closing.getMonth() + 1).toString().padStart(2, '0')}`;
}

function historicalAverageFee(matterType: string): number {
  const all = listMatters('closed').filter((m) => m.matter_type === matterType);
  if (!all.length) return 0;
  let total = 0;
  for (const m of all) {
    const s = summariseMatterBilling(m.id);
    total += (s.lawyerSeconds / 3600) * FIRM_RATE_AUD + s.aiCostUsd * USD_TO_AUD;
  }
  return total / all.length;
}

export function matterPipelines(): MatterPipeline[] {
  const matters = listMatters('open');
  const out: MatterPipeline[] = [];
  for (const m of matters) {
    const billing = summariseMatterBilling(m.id);
    const estimate = getMatterCostEstimate(m.id);
    const estTotalAud = estimate
      ? estimate.estimated_ai_usd * USD_TO_AUD + estimate.estimated_lawyer_hours * FIRM_RATE_AUD
      : historicalAverageFee(m.matter_type);
    const alreadyBilledAud = (billing.lawyerSeconds / 3600) * FIRM_RATE_AUD + billing.aiCostUsd * USD_TO_AUD;
    const remaining = Math.max(0, estTotalAud - alreadyBilledAud);
    const expectedClosingMonth = predictedClosingMonth(m.opened_at, m.matter_type);
    const pctComplete = estTotalAud > 0 ? alreadyBilledAud / estTotalAud : 0;
    const confidence: 'high' | 'medium' | 'low' = pctComplete > 0.5 ? 'high' : pctComplete > 0.25 ? 'medium' : 'low';
    out.push({
      matterId: m.id,
      matterNumber: m.matter_number,
      matterTitle: m.title,
      matterType: m.matter_type,
      estimatedTotalAud: estTotalAud,
      alreadyBilledAud,
      expectedClosingMonth,
      remainingAud: remaining,
      confidence,
    });
  }
  return out;
}

export interface PipelineForecast {
  period: string;
  expectedRevenueAud: number;
  matterCount: number;
  rows: MatterPipeline[];
}

export function forecastWindow(days: number): PipelineForecast {
  const all = matterPipelines();
  const cutoff = new Date(Date.now() + days * 86400000);
  const cutoffMonth = `${cutoff.getFullYear()}-${(cutoff.getMonth() + 1).toString().padStart(2, '0')}`;
  const filtered = all.filter((p) => p.expectedClosingMonth <= cutoffMonth);
  const expected = filtered.reduce((s, p) => s + p.remainingAud, 0);
  return {
    period: `next-${days}-days`,
    expectedRevenueAud: expected,
    matterCount: filtered.length,
    rows: filtered.sort((a, b) => a.expectedClosingMonth.localeCompare(b.expectedClosingMonth)),
  };
}

export function forecastByMonth(months = 6): { ym: string; expectedRevenueAud: number; matterCount: number }[] {
  const all = matterPipelines();
  const now = new Date();
  const out: { ym: string; expectedRevenueAud: number; matterCount: number }[] = [];
  for (let i = 0; i < months; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
    const matters = all.filter((p) => p.expectedClosingMonth === ym);
    out.push({
      ym,
      expectedRevenueAud: matters.reduce((s, p) => s + p.remainingAud, 0),
      matterCount: matters.length,
    });
  }
  return out;
}

export interface MattersAtRisk {
  matterId: string;
  matterNumber: string;
  reason: string;
}

export function mattersAtRiskOfDelay(): MattersAtRisk[] {
  const out: MattersAtRisk[] = [];
  const now = new Date();
  for (const p of matterPipelines()) {
    const closing = new Date(`${p.expectedClosingMonth}-15`);
    const daysOut = (closing.getTime() - now.getTime()) / (24 * 3600 * 1000);
    if (daysOut < 30 && p.alreadyBilledAud / Math.max(1, p.estimatedTotalAud) < 0.6) {
      out.push({
        matterId: p.matterId,
        matterNumber: p.matterNumber,
        reason: `Closing within 30d but only ${Math.round((p.alreadyBilledAud / Math.max(1, p.estimatedTotalAud)) * 100)}% billed`,
      });
    }
  }
  return out;
}

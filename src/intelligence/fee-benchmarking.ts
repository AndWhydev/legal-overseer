/**
 * 1.5 — Legal Fee Benchmarking.
 *
 * Stores a benchmark table of publicly available Australian legal fee
 * data per matter type, jurisdiction, and complexity. Seeded on first
 * boot with sensible defaults compiled from Law Society publications;
 * the compliance-monitor agent can update the table monthly.
 *
 * Used by the cost estimator + the new budgeting UI to show "this
 * matter falls in the AUD X–Y benchmark band; your firm's average is
 * Z."
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { listMatters } from '../db/repositories/matters.js';
import { summariseMatterBilling } from '../compliance/billing.js';
import { getMatterCostEstimate } from '../cost-estimator/index.js';

const logger = createSafeLogger('FeeBenchmark');

export interface FeeBenchmark {
  id: string;
  matter_type: string;
  complexity: 'simple' | 'medium' | 'complex';
  jurisdiction: string;
  low_aud: number;
  median_aud: number;
  high_aud: number;
  source: string;
  source_url: string | null;
  as_of_date: string;
  notes: string | null;
  created_at: string;
}

/**
 * Built-in seed benchmarks compiled from public Law Society fee
 * schedules. These are approximate and explicitly disclosed as
 * starting points rather than authoritative.
 */
const SEED_BENCHMARKS: Omit<FeeBenchmark, 'id' | 'created_at'>[] = [
  // Commercial
  { matter_type: 'commercial', complexity: 'simple', jurisdiction: 'NSW', low_aud: 2500, median_aud: 5000, high_aud: 9000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: 'simple commercial advice / contract review' },
  { matter_type: 'commercial', complexity: 'medium', jurisdiction: 'NSW', low_aud: 8000, median_aud: 18000, high_aud: 32000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'commercial', complexity: 'complex', jurisdiction: 'NSW', low_aud: 25000, median_aud: 65000, high_aud: 180000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Litigation
  { matter_type: 'litigation', complexity: 'simple', jurisdiction: 'NSW', low_aud: 6000, median_aud: 15000, high_aud: 35000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: 'local court small claim' },
  { matter_type: 'litigation', complexity: 'medium', jurisdiction: 'NSW', low_aud: 20000, median_aud: 60000, high_aud: 150000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'litigation', complexity: 'complex', jurisdiction: 'NSW', low_aud: 80000, median_aud: 250000, high_aud: 800000, source: 'Law Society of NSW fee guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Property / conveyancing
  { matter_type: 'property', complexity: 'simple', jurisdiction: 'NSW', low_aud: 1500, median_aud: 2500, high_aud: 4500, source: 'Law Society of NSW property guide', source_url: null, as_of_date: '2026-01-01', notes: 'residential conveyance' },
  { matter_type: 'property', complexity: 'medium', jurisdiction: 'NSW', low_aud: 4000, median_aud: 8500, high_aud: 18000, source: 'Law Society of NSW property guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'property', complexity: 'complex', jurisdiction: 'NSW', low_aud: 15000, median_aud: 40000, high_aud: 95000, source: 'Law Society of NSW property guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Family
  { matter_type: 'family', complexity: 'simple', jurisdiction: 'NSW', low_aud: 4000, median_aud: 9000, high_aud: 18000, source: 'Family Law Practitioners Association', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'family', complexity: 'medium', jurisdiction: 'NSW', low_aud: 15000, median_aud: 35000, high_aud: 70000, source: 'Family Law Practitioners Association', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'family', complexity: 'complex', jurisdiction: 'NSW', low_aud: 50000, median_aud: 120000, high_aud: 350000, source: 'Family Law Practitioners Association', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Estates / probate
  { matter_type: 'estates', complexity: 'simple', jurisdiction: 'NSW', low_aud: 1500, median_aud: 3000, high_aud: 6500, source: 'Law Society of NSW estates guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'estates', complexity: 'medium', jurisdiction: 'NSW', low_aud: 5000, median_aud: 12000, high_aud: 28000, source: 'Law Society of NSW estates guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'estates', complexity: 'complex', jurisdiction: 'NSW', low_aud: 20000, median_aud: 50000, high_aud: 150000, source: 'Law Society of NSW estates guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Employment
  { matter_type: 'employment', complexity: 'simple', jurisdiction: 'NSW', low_aud: 2000, median_aud: 4500, high_aud: 9000, source: 'Law Society fee schedules', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'employment', complexity: 'medium', jurisdiction: 'NSW', low_aud: 8000, median_aud: 20000, high_aud: 45000, source: 'Law Society fee schedules', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'employment', complexity: 'complex', jurisdiction: 'NSW', low_aud: 30000, median_aud: 85000, high_aud: 220000, source: 'Law Society fee schedules', source_url: null, as_of_date: '2026-01-01', notes: null },
  // Wills
  { matter_type: 'wills', complexity: 'simple', jurisdiction: 'NSW', low_aud: 350, median_aud: 750, high_aud: 1500, source: 'Law Society wills guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'wills', complexity: 'medium', jurisdiction: 'NSW', low_aud: 1200, median_aud: 2800, high_aud: 6500, source: 'Law Society wills guide', source_url: null, as_of_date: '2026-01-01', notes: null },
  { matter_type: 'wills', complexity: 'complex', jurisdiction: 'NSW', low_aud: 5000, median_aud: 12000, high_aud: 30000, source: 'Law Society wills guide', source_url: null, as_of_date: '2026-01-01', notes: null },
];

export function ensureSeedBenchmarks(): void {
  const db = getDatabase();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM fee_benchmarks').get() as { n: number }).n;
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO fee_benchmarks
       (id, matter_type, complexity, jurisdiction, low_aud, median_aud, high_aud,
        source, source_url, as_of_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const seed of SEED_BENCHMARKS) {
      insert.run(
        randomUUID(),
        seed.matter_type,
        seed.complexity,
        seed.jurisdiction,
        seed.low_aud,
        seed.median_aud,
        seed.high_aud,
        seed.source,
        seed.source_url,
        seed.as_of_date,
        seed.notes,
      );
    }
  });
  tx();
  logger.info(`seeded ${SEED_BENCHMARKS.length} fee benchmark rows`);
}

export interface BenchmarkLookup {
  matterType: string;
  complexity: 'simple' | 'medium' | 'complex';
  jurisdiction?: string;
}

export function getBenchmark(input: BenchmarkLookup): FeeBenchmark | null {
  ensureSeedBenchmarks();
  const db = getDatabase();
  const jurisdiction = input.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW';
  const row = db
    .prepare(
      `SELECT * FROM fee_benchmarks
       WHERE matter_type = ? AND complexity = ? AND jurisdiction = ?
       ORDER BY as_of_date DESC LIMIT 1`,
    )
    .get(input.matterType, input.complexity, jurisdiction) as FeeBenchmark | undefined;
  if (row) return row;
  // Fallback: any jurisdiction.
  return (
    (db
      .prepare(
        `SELECT * FROM fee_benchmarks WHERE matter_type = ? AND complexity = ?
         ORDER BY as_of_date DESC LIMIT 1`,
      )
      .get(input.matterType, input.complexity) as FeeBenchmark | undefined) ?? null
  );
}

export function listAllBenchmarks(): FeeBenchmark[] {
  ensureSeedBenchmarks();
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM fee_benchmarks ORDER BY matter_type, complexity, jurisdiction`)
    .all() as FeeBenchmark[];
}

export interface UpsertBenchmarkInput {
  matterType: string;
  complexity: 'simple' | 'medium' | 'complex';
  jurisdiction: string;
  lowAud: number;
  medianAud: number;
  highAud: number;
  source: string;
  sourceUrl?: string;
  asOfDate: string;
  notes?: string;
}

export function upsertBenchmark(input: UpsertBenchmarkInput): FeeBenchmark {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO fee_benchmarks
       (id, matter_type, complexity, jurisdiction, low_aud, median_aud, high_aud,
        source, source_url, as_of_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.matterType,
    input.complexity,
    input.jurisdiction,
    input.lowAud,
    input.medianAud,
    input.highAud,
    input.source,
    input.sourceUrl ?? null,
    input.asOfDate,
    input.notes ?? null,
  );
  return db.prepare(`SELECT * FROM fee_benchmarks WHERE id = ?`).get(id) as FeeBenchmark;
}

export interface FirmFeeStats {
  matterType: string;
  matterCount: number;
  averageBilledAud: number;
  averageAiCostAud: number;
}

/**
 * Compute the firm's historical average fee per matter type from
 * billing_log (lawyer time @ rate + AI cost). Rate defaults to AUD 450/h
 * if FIRM_LAWYER_RATE_AUD is not set.
 */
export function getFirmFeeStats(): FirmFeeStats[] {
  const rate = Number.parseFloat(process.env.FIRM_LAWYER_RATE_AUD ?? '450');
  const all = listMatters('closed');
  const buckets = new Map<string, { count: number; billed: number; aiCost: number }>();
  for (const m of all) {
    const billing = summariseMatterBilling(m.id);
    const lawyerHours = billing.lawyerSeconds / 3600;
    const billed = lawyerHours * rate;
    const aiCost = billing.aiCostUsd * 1.5; // rough USD→AUD; firm can override
    const b = buckets.get(m.matter_type) ?? { count: 0, billed: 0, aiCost: 0 };
    b.count += 1;
    b.billed += billed;
    b.aiCost += aiCost;
    buckets.set(m.matter_type, b);
  }
  return Array.from(buckets.entries()).map(([matterType, b]) => ({
    matterType,
    matterCount: b.count,
    averageBilledAud: b.count ? b.billed / b.count : 0,
    averageAiCostAud: b.count ? b.aiCost / b.count : 0,
  }));
}

export interface MatterBenchmarkComparison {
  matterId: string;
  matterType: string;
  complexity: string;
  benchmark: FeeBenchmark | null;
  firmAverageAud: number | null;
  estimatedAud: number | null;
}

export function compareMatterAgainstBenchmark(matterId: string): MatterBenchmarkComparison | null {
  const estimate = getMatterCostEstimate(matterId);
  if (!estimate) return null;
  const benchmark = getBenchmark({
    matterType: estimate.matter_type,
    complexity: estimate.complexity,
  });
  const firmStats = getFirmFeeStats().find((s) => s.matterType === estimate.matter_type);
  return {
    matterId,
    matterType: estimate.matter_type,
    complexity: estimate.complexity,
    benchmark,
    firmAverageAud: firmStats?.averageBilledAud ?? null,
    estimatedAud: estimate.estimated_ai_usd * 1.5 + estimate.estimated_lawyer_hours * 450,
  };
}

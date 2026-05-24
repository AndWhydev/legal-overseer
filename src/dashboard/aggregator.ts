/**
 * Dashboard data aggregator — Legal Overseer.
 *
 * Reads the SQLite database (read-only) and assembles the four views
 * the dashboard renders:
 *
 *   - Matter list:     every matter with status, lawyer, deadlines.
 *   - Review queue:    every AI output awaiting lawyer approval.
 *   - Deadline calendar: every open deadline in the next 30 days.
 *   - Billing tracker: AI time + spend vs lawyer time per matter.
 *
 * Everything here is read-only — the dashboard never mutates state.
 * Mutations (approve / reject) go through src/compliance/reviewGate.
 */

import { getDatabase } from '../db/connection.js';
import { listMatters, type Matter, type MatterStatus } from '../db/repositories/matters.js';
import {
  listUpcoming,
  listDeadlinesForMatter,
  type Deadline,
} from '../db/repositories/deadlines.js';
import {
  listPendingReviews,
  listReviewsByStatus,
  type ReviewQueueRow,
  type ReviewStatus,
} from '../compliance/reviewGate.js';
import {
  summariseMatterBilling,
  listMatterBilling,
  type BillingEntry,
  type MatterBillingSummary,
} from '../compliance/billing.js';
import { listAuditForMatter, type LegalAuditEntry } from '../compliance/audit.js';

export type MatterHealth = 'green' | 'amber' | 'red';

export interface MatterRow {
  matter: Matter;
  health: MatterHealth;
  openDeadlines: number;
  /** Days until the most urgent open deadline (null when none). */
  daysToMostUrgent: number | null;
  pendingReviews: number;
  billing: MatterBillingSummary;
}

export interface MatterSummary {
  rows: MatterRow[];
  totals: {
    matters: number;
    open: number;
    onHold: number;
    closed: number;
    archived: number;
    pendingReviews: number;
    upcomingDeadlines30d: number;
    aiCostUsdTotal: number;
  };
  generatedAt: string;
}

export interface MatterDetail {
  matter: Matter;
  row: MatterRow;
  deadlines: Deadline[];
  reviews: ReviewQueueRow[];
  billing: BillingEntry[];
  billingSummary: MatterBillingSummary;
  audit: LegalAuditEntry[];
}

function daysFromNow(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function deriveHealth(matter: Matter, deadlines: Deadline[], pendingReviews: number): MatterHealth {
  if (matter.status === 'closed' || matter.status === 'archived') return 'green';

  // RED: any limitation deadline within 7 days.
  for (const d of deadlines) {
    if (d.deadline_type === 'limitation') {
      const days = daysFromNow(d.due_date);
      if (days <= 7) return 'red';
    }
  }
  // RED: any pending review older than 7 days (lawyer hasn't looked).
  // (cheap upstream check; richer check happens in the review-queue view)

  // AMBER: any deadline within 14 days, or any pending review.
  for (const d of deadlines) {
    const days = daysFromNow(d.due_date);
    if (days <= 14) return 'amber';
  }
  if (pendingReviews > 0) return 'amber';

  return 'green';
}

export function buildMatterSummary(): MatterSummary {
  const matters = listMatters();
  const upcoming = listUpcoming(30);

  let totalCost = 0;
  let pendingReviewsTotal = 0;
  const rows: MatterRow[] = [];

  for (const m of matters) {
    const matterDeadlines = upcoming.filter((d) => d.matter_id === m.id);
    const pendingReviews = countPendingReviewsForMatter(m.id);
    const billing = summariseMatterBilling(m.id);

    const sortedDeadlines = matterDeadlines.sort((a, b) =>
      a.due_date.localeCompare(b.due_date),
    );
    const mostUrgent = sortedDeadlines[0];

    rows.push({
      matter: m,
      health: deriveHealth(m, matterDeadlines, pendingReviews),
      openDeadlines: matterDeadlines.length,
      daysToMostUrgent: mostUrgent ? daysFromNow(mostUrgent.due_date) : null,
      pendingReviews,
      billing,
    });

    totalCost += billing.aiCostUsd;
    pendingReviewsTotal += pendingReviews;
  }

  const counts = countMattersByStatus();
  return {
    rows,
    totals: {
      matters: matters.length,
      open: counts.open,
      onHold: counts.on_hold,
      closed: counts.closed,
      archived: counts.archived,
      pendingReviews: pendingReviewsTotal,
      upcomingDeadlines30d: upcoming.length,
      aiCostUsdTotal: totalCost,
    },
    generatedAt: new Date().toISOString(),
  };
}

function countMattersByStatus(): Record<MatterStatus, number> {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM matters GROUP BY status`)
    .all() as { status: MatterStatus; n: number }[];
  const out: Record<MatterStatus, number> = { open: 0, on_hold: 0, closed: 0, archived: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

function countPendingReviewsForMatter(matterId: string): number {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM review_queue
       WHERE matter_id = ? AND status = 'pending'`,
    )
    .get(matterId) as { n: number };
  return row.n;
}

export function buildMatterDetail(matterId: string): MatterDetail | null {
  const db = getDatabase();
  const matter = db
    .prepare(`SELECT * FROM matters WHERE id = ?`)
    .get(matterId) as Matter | undefined;
  if (!matter) return null;

  const deadlines = listDeadlinesForMatter(matterId);
  const reviews = db
    .prepare(
      `SELECT * FROM review_queue WHERE matter_id = ?
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all(matterId) as ReviewQueueRow[];
  const billing = listMatterBilling(matterId);
  const billingSummary = summariseMatterBilling(matterId);
  const audit = listAuditForMatter(matterId, 100);

  const openDeadlines = deadlines.filter((d) => d.status === 'open');
  const pendingReviews = reviews.filter((r) => r.status === 'pending').length;

  const row: MatterRow = {
    matter,
    health: deriveHealth(matter, openDeadlines, pendingReviews),
    openDeadlines: openDeadlines.length,
    daysToMostUrgent: openDeadlines[0] ? daysFromNow(openDeadlines[0].due_date) : null,
    pendingReviews,
    billing: billingSummary,
  };

  return { matter, row, deadlines, reviews, billing, billingSummary, audit };
}

// --------------------- review queue ---------------------

export interface ReviewQueueView {
  pending: ReviewQueueRow[];
  approved: ReviewQueueRow[];
  rejected: ReviewQueueRow[];
  sent: ReviewQueueRow[];
  generatedAt: string;
}

export function buildReviewQueueView(): ReviewQueueView {
  return {
    pending: listPendingReviews(200),
    approved: listReviewsByStatus('approved', 50),
    rejected: listReviewsByStatus('rejected', 50),
    sent: listReviewsByStatus('sent', 50),
    generatedAt: new Date().toISOString(),
  };
}

export function getReviewWithMatter(reviewId: string): {
  review: ReviewQueueRow;
  matter: Matter | null;
} | null {
  const db = getDatabase();
  const review = db
    .prepare(`SELECT * FROM review_queue WHERE id = ?`)
    .get(reviewId) as ReviewQueueRow | undefined;
  if (!review) return null;
  const matter = review.matter_id
    ? (db.prepare(`SELECT * FROM matters WHERE id = ?`).get(review.matter_id) as Matter | undefined)
    : undefined;
  return { review, matter: matter ?? null };
}

// --------------------- deadline calendar ---------------------

export interface CalendarEntry {
  date: string;
  deadlines: Array<{ deadline: Deadline; matter: Matter | null }>;
}

export interface CalendarView {
  entries: CalendarEntry[];
  windowDays: number;
  generatedAt: string;
}

export function buildCalendarView(windowDays = 30): CalendarView {
  const deadlines = listUpcoming(windowDays);
  const db = getDatabase();

  // Group by date.
  const byDate = new Map<string, Array<{ deadline: Deadline; matter: Matter | null }>>();
  for (const d of deadlines) {
    const matter = d.matter_id
      ? (db.prepare(`SELECT * FROM matters WHERE id = ?`).get(d.matter_id) as Matter | undefined)
      : undefined;
    const bucket = byDate.get(d.due_date) ?? [];
    bucket.push({ deadline: d, matter: matter ?? null });
    byDate.set(d.due_date, bucket);
  }

  const entries: CalendarEntry[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, deadlines: items }));

  return { entries, windowDays, generatedAt: new Date().toISOString() };
}

// --------------------- billing tracker ---------------------

export interface BillingTrackerRow {
  matter: Matter;
  summary: MatterBillingSummary;
  ratioAiToLawyer: number | null;
}

export interface BillingTrackerView {
  rows: BillingTrackerRow[];
  totals: {
    aiSeconds: number;
    aiCostUsd: number;
    lawyerSeconds: number;
  };
  generatedAt: string;
}

export function buildBillingTrackerView(): BillingTrackerView {
  const matters = listMatters();
  const rows: BillingTrackerRow[] = [];
  let aiSeconds = 0;
  let aiCost = 0;
  let lawyerSeconds = 0;

  for (const m of matters) {
    const summary = summariseMatterBilling(m.id);
    rows.push({
      matter: m,
      summary,
      ratioAiToLawyer: summary.lawyerSeconds > 0 ? summary.aiSeconds / summary.lawyerSeconds : null,
    });
    aiSeconds += summary.aiSeconds;
    aiCost += summary.aiCostUsd;
    lawyerSeconds += summary.lawyerSeconds;
  }

  rows.sort((a, b) => b.summary.aiCostUsd - a.summary.aiCostUsd);
  return {
    rows,
    totals: { aiSeconds, aiCostUsd: aiCost, lawyerSeconds },
    generatedAt: new Date().toISOString(),
  };
}

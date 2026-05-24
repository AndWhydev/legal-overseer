/**
 * 4.5 — Costs disclosure compliance checker.
 *
 * Run on every engagement letter before send. Verifies presence of
 * the elements required by Legal Profession Uniform Law: fee
 * estimate, basis of charging, disbursements, billing frequency,
 * dispute resolution, client rights. Hard-stops the queue if any
 * required element is missing.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from './audit.js';
import { getReviewById } from './reviewGate.js';

const logger = createSafeLogger('CostsDisclosure');

export interface CostsDisclosureCheck {
  id: string;
  engagement_letter_review_id: string | null;
  matter_id: string | null;
  passed: number;
  missing_elements_json: string | null;
  jurisdiction: string | null;
  checked_at: string;
}

interface ElementRule {
  key: string;
  label: string;
  patterns: RegExp[];
  guidance: string;
}

const REQUIRED_ELEMENTS: ElementRule[] = [
  {
    key: 'fee_estimate',
    label: 'Fee estimate',
    patterns: [/fee\s+estimate/i, /estimated\s+(total\s+)?fees?/i, /estimat(e|ed)\s+cost/i],
    guidance: 'Include a sentence such as "Our estimated total fees for this matter are AUD X to AUD Y, depending on complexity."',
  },
  {
    key: 'basis_of_charging',
    label: 'Basis of charging',
    patterns: [/hourly\s+rate/i, /fixed\s+fee/i, /retainer/i, /basis\s+of\s+charging/i, /charged\s+at\s+aud/i],
    guidance: 'State whether the engagement is on an hourly basis (and the rate), fixed fee, or capped fee.',
  },
  {
    key: 'disbursements',
    label: 'Disbursements',
    patterns: [/disbursement/i, /out[-\s]?of[-\s]?pocket/i, /third[-\s]?party\s+costs?/i],
    guidance: 'Identify likely disbursements (e.g. court filing fees, expert reports).',
  },
  {
    key: 'billing_frequency',
    label: 'Billing frequency',
    patterns: [/billed\s+monthly/i, /invoice(d|s)\s+monthly/i, /interim\s+invoice/i, /billing\s+(cycle|frequency)/i],
    guidance: 'State billing frequency (e.g. "We bill monthly in arrears.").',
  },
  {
    key: 'dispute_resolution',
    label: 'Dispute resolution',
    patterns: [/dispute\s+resolution/i, /costs?\s+dispute/i, /law\s+society\s+complaint/i, /legal\s+services\s+commissioner/i],
    guidance: 'Include the client\'s right to refer a costs dispute to the Legal Services Commissioner.',
  },
  {
    key: 'client_rights',
    label: 'Client rights statement',
    patterns: [/your\s+rights/i, /right\s+to\s+(an\s+)?itemised\s+bill/i, /right\s+to\s+negotiate/i, /client\s+rights/i],
    guidance: 'Spell out the client\'s rights, including the right to an itemised bill.',
  },
];

export interface CheckEngagementLetterInput {
  reviewId: string;
  matterId?: string | null;
  jurisdiction?: string;
}

export interface CheckResult {
  passed: boolean;
  missing: { key: string; label: string; guidance: string }[];
  checkId: string;
}

export function checkEngagementLetter(input: CheckEngagementLetterInput): CheckResult {
  const review = getReviewById(input.reviewId);
  if (!review) throw new Error(`review ${input.reviewId} not found`);
  const text = review.body_markdown;
  const missing: { key: string; label: string; guidance: string }[] = [];
  for (const rule of REQUIRED_ELEMENTS) {
    if (!rule.patterns.some((p) => p.test(text))) {
      missing.push({ key: rule.key, label: rule.label, guidance: rule.guidance });
    }
  }
  const passed = missing.length === 0;
  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO costs_disclosure_checks
       (id, engagement_letter_review_id, matter_id, passed,
        missing_elements_json, jurisdiction, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.reviewId,
    input.matterId ?? review.matter_id,
    passed ? 1 : 0,
    missing.length ? JSON.stringify(missing) : null,
    input.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
    now,
  );
  appendLegalAudit({
    matterId: input.matterId ?? review.matter_id,
    actorId: 'costs-disclosure-system',
    action: passed ? 'costs_disclosure.passed' : 'costs_disclosure.failed',
    detail: passed ? 'engagement letter complete' : `missing: ${missing.map((m) => m.label).join(', ')}`,
    refTable: 'costs_disclosure_checks',
    refId: id,
    metadata: { missing_count: missing.length },
  });
  if (!passed) {
    logger.warn(`costs disclosure FAILED for review ${input.reviewId}: ${missing.map((m) => m.label).join(', ')}`);
  }
  return { passed, missing, checkId: id };
}

/**
 * Guard called by the outbound channel before sending an engagement
 * letter. Throws if the most recent check failed.
 */
export function assertCostsDisclosurePassed(reviewId: string): void {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT * FROM costs_disclosure_checks
       WHERE engagement_letter_review_id = ?
       ORDER BY checked_at DESC LIMIT 1`,
    )
    .get(reviewId) as CostsDisclosureCheck | undefined;
  if (!row) {
    throw new Error(`engagement letter ${reviewId} has not been checked for costs disclosure`);
  }
  if (row.passed !== 1) {
    const missing = row.missing_elements_json ?? '(unknown)';
    throw new Error(`costs disclosure check failed: ${missing}`);
  }
}

export function listChecks(limit = 100): CostsDisclosureCheck[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM costs_disclosure_checks ORDER BY checked_at DESC LIMIT ?`)
    .all(limit) as CostsDisclosureCheck[];
}

export function nearMissReport(period: string): {
  total: number;
  failed: number;
  failureReasons: Record<string, number>;
} {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM costs_disclosure_checks WHERE substr(checked_at, 1, 7) = ?`,
    )
    .all(period) as CostsDisclosureCheck[];
  const reasons: Record<string, number> = {};
  for (const r of rows) {
    if (r.passed === 0 && r.missing_elements_json) {
      try {
        const missing = JSON.parse(r.missing_elements_json) as { label: string }[];
        for (const m of missing) reasons[m.label] = (reasons[m.label] ?? 0) + 1;
      } catch { /* ignore */ }
    }
  }
  return { total: rows.length, failed: rows.filter((r) => r.passed === 0).length, failureReasons: reasons };
}

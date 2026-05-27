/**
 * Matters repository.
 *
 * Each row represents one client engagement. matter_number is the
 * firm-facing reference the dashboard shows everywhere — it embeds in
 * email subjects, review-queue rows, and audit-log entries so a lawyer
 * can correlate everything across surfaces.
 *
 * Matter numbers are issued by nextMatterNumber() in a predictable
 * YYYY-NNNN format, scoped to the calendar year. The numbering is
 * naive on purpose: the partner is the source of truth, the system
 * just suggests the next free slot.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('MatterRepo');

export type MatterStatus = 'open' | 'on_hold' | 'closed' | 'archived';

export interface Matter {
  id: string;
  matter_number: string;
  title: string;
  client_name: string;
  client_email: string | null;
  matter_type: string;
  jurisdiction: string;
  responsible_lawyer_email: string | null;
  opposing_party: string | null;
  opposing_solicitor: string | null;
  status: MatterStatus;
  opened_at: string;
  closed_at: string | null;
  intake_email_id: string | null;
  notes: string | null;
  matter_folder: string | null;
  created_at: string;
  updated_at: string;
  /** Added by migration 015 — links a matter to a row in `clients`. */
  client_id?: string | null;
  /** Added by migration 015 — multi-office support. */
  office_id?: string | null;
}

export interface CreateMatterInput {
  matter_number?: string;
  title: string;
  client_name: string;
  client_email?: string | null;
  matter_type: string;
  jurisdiction?: string;
  responsible_lawyer_email?: string | null;
  opposing_party?: string | null;
  opposing_solicitor?: string | null;
  intake_email_id?: string | null;
  notes?: string | null;
  matter_folder?: string | null;
}

export interface UpdateMatterInput {
  title?: string;
  client_name?: string;
  client_email?: string | null;
  matter_type?: string;
  jurisdiction?: string;
  responsible_lawyer_email?: string | null;
  opposing_party?: string | null;
  opposing_solicitor?: string | null;
  status?: MatterStatus;
  notes?: string | null;
  matter_folder?: string | null;
}

/**
 * Compute the next matter number in YYYY-NNNN format. Looks at the
 * highest-numbered matter opened this calendar year and returns
 * `${year}-${nextSequence.padStart(4)}`.
 */
export function nextMatterNumber(now: Date = new Date()): string {
  const db = getDatabase();
  const year = now.getFullYear();
  const prefix = `${year}-`;
  const row = db
    .prepare(
      `SELECT matter_number FROM matters
       WHERE matter_number LIKE ?
       ORDER BY matter_number DESC LIMIT 1`,
    )
    .get(`${prefix}%`) as { matter_number: string } | undefined;

  let next = 1;
  if (row) {
    const tail = row.matter_number.slice(prefix.length);
    const parsed = Number.parseInt(tail, 10);
    if (Number.isFinite(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function createMatter(input: CreateMatterInput): Matter {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const matterNumber = input.matter_number ?? nextMatterNumber();

  db.prepare(
    `
    INSERT INTO matters (
      id, matter_number, title, client_name, client_email, matter_type,
      jurisdiction, responsible_lawyer_email, opposing_party,
      opposing_solicitor, status, opened_at, intake_email_id, notes,
      matter_folder, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    matterNumber,
    input.title,
    input.client_name,
    input.client_email ?? null,
    input.matter_type,
    input.jurisdiction ?? 'NSW',
    input.responsible_lawyer_email ?? null,
    input.opposing_party ?? null,
    input.opposing_solicitor ?? null,
    now,
    input.intake_email_id ?? null,
    input.notes ?? null,
    input.matter_folder ?? null,
    now,
    now,
  );

  logger.info(`Created matter ${matterNumber} (${input.title}) for ${input.client_name}`);
  return getMatterById(id) as Matter;
}

export function updateMatter(id: string, patch: UpdateMatterInput): Matter | null {
  const db = getDatabase();
  const existing = getMatterById(id);
  if (!existing) return null;

  const merged: Matter = { ...existing, ...patch, updated_at: new Date().toISOString() };
  if (patch.status === 'closed' && existing.status !== 'closed') {
    merged.closed_at = merged.updated_at;
  }

  db.prepare(
    `
    UPDATE matters SET
      title = ?, client_name = ?, client_email = ?, matter_type = ?,
      jurisdiction = ?, responsible_lawyer_email = ?, opposing_party = ?,
      opposing_solicitor = ?, status = ?, closed_at = ?, notes = ?,
      matter_folder = ?, updated_at = ?
    WHERE id = ?
    `,
  ).run(
    merged.title,
    merged.client_name,
    merged.client_email,
    merged.matter_type,
    merged.jurisdiction,
    merged.responsible_lawyer_email,
    merged.opposing_party,
    merged.opposing_solicitor,
    merged.status,
    merged.closed_at,
    merged.notes,
    merged.matter_folder,
    merged.updated_at,
    id,
  );
  return getMatterById(id);
}

export function getMatterById(id: string): Matter | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM matters WHERE id = ?`).get(id) as
    | Matter
    | undefined;
  return row ?? null;
}

/**
 * Find the most recent matter for a given client email. Used by the
 * intake pipeline to tell a returning client from a brand-new enquiry.
 */
export function getMatterByClientEmail(clientEmail: string): Matter | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT * FROM matters WHERE lower(client_email) = lower(?)
       ORDER BY opened_at DESC LIMIT 1`,
    )
    .get(clientEmail) as Matter | undefined;
  return row ?? null;
}

export function getMatterByNumber(matterNumber: string): Matter | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM matters WHERE matter_number = ?`)
    .get(matterNumber) as Matter | undefined;
  return row ?? null;
}

export function listMatters(status?: MatterStatus): Matter[] {
  const db = getDatabase();
  if (status) {
    return db
      .prepare(`SELECT * FROM matters WHERE status = ? ORDER BY opened_at DESC`)
      .all(status) as Matter[];
  }
  return db.prepare(`SELECT * FROM matters ORDER BY opened_at DESC`).all() as Matter[];
}

export interface MatterCounts {
  open: number;
  on_hold: number;
  closed: number;
  archived: number;
}

export function getMatterCounts(): MatterCounts {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM matters GROUP BY status`)
    .all() as { status: MatterStatus; n: number }[];
  const counts: MatterCounts = { open: 0, on_hold: 0, closed: 0, archived: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

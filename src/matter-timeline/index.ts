/**
 * Matter timeline aggregator.
 *
 * Joins every event surface for a matter into one chronologically-ordered
 * list:
 *
 *   - matter.created  (one row, from matters.created_at)
 *   - audit log entries (legal_audit_log)
 *   - documents uploaded under data/documents/<matter-id>/
 *   - deadlines (open + resolved)
 *   - review queue items (pending / approved / rejected / sent)
 *   - billing entries (AI runs + lawyer time)
 *
 * Each event is converted to a TimelineEvent with a deterministic
 * colour (green/amber/red) and a kind tag the renderer uses for the
 * icon. The renderer at src/dashboard/timeline-view renders this for
 * both the on-screen view and the printable export.
 */

import { getDatabase } from '../db/connection.js';
import { listAuditForMatter, type LegalAuditEntry } from '../compliance/audit.js';
import { listDeadlinesForMatter, type Deadline } from '../db/repositories/deadlines.js';
import { listMatterBilling, type BillingEntry } from '../compliance/billing.js';
import { listMatterDocuments, type StoredDocument } from '../uploads/index.js';
import type { Matter } from '../db/repositories/matters.js';

export type TimelineColor = 'green' | 'amber' | 'red' | 'grey';

export type TimelineKind =
  | 'matter_created'
  | 'document'
  | 'deadline'
  | 'review'
  | 'audit'
  | 'billing';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  /** ISO timestamp used for ordering. */
  at: string;
  /** Short headline shown in bold. */
  title: string;
  /** Free-text body. */
  detail: string;
  /** Colour driving the dot + ribbon. */
  color: TimelineColor;
  /** Optional URL for the headline to link to. */
  href?: string;
  /** Optional badge text (e.g. "limitation", "approved"). */
  badge?: string;
}

function deadlineColor(d: Deadline): TimelineColor {
  if (d.status === 'missed') return 'red';
  if (d.status === 'met' || d.status === 'waived') return 'green';
  // Open / reminded — colour by urgency.
  const daysLeft = Math.round((new Date(d.due_date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 7) return 'red';
  if (daysLeft <= 14) return 'amber';
  return 'grey';
}

function reviewColor(status: string): TimelineColor {
  if (status === 'rejected') return 'red';
  if (status === 'approved' || status === 'sent') return 'green';
  return 'amber';
}

function deadlineKindBadge(d: Deadline): string {
  return d.deadline_type;
}

function buildDocumentEvents(matterId: string): TimelineEvent[] {
  const docs: StoredDocument[] = listMatterDocuments(matterId);
  return docs.map((d) => ({
    id: `doc:${d.id}`,
    kind: 'document',
    at: d.uploadedAt,
    title: `Document uploaded — ${d.filename}`,
    detail: `${d.sizeBytes} bytes · ${d.extractedChars} chars extracted (${d.extractionNote}). Uploaded by ${d.uploadedBy}.`,
    color: 'grey',
    href: `/matter/${matterId}/document/${d.id}`,
    badge: 'document',
  }));
}

function buildAuditEvents(matterId: string): TimelineEvent[] {
  const rows: LegalAuditEntry[] = listAuditForMatter(matterId, 500);
  return rows.map((r) => ({
    id: `audit:${r.id}`,
    kind: 'audit',
    at: r.created_at,
    title: r.action,
    detail: r.detail ? `${r.actor_id} · ${r.detail}` : r.actor_id,
    color: 'grey',
    badge: 'audit',
  }));
}

function buildDeadlineEvents(matterId: string): TimelineEvent[] {
  const dls: Deadline[] = listDeadlinesForMatter(matterId);
  return dls.map((d) => ({
    id: `deadline:${d.id}`,
    kind: 'deadline',
    at: `${d.due_date}T00:00:00.000Z`,
    title: `Deadline — ${d.description}`,
    detail: `Type: ${d.deadline_type}. Status: ${d.status}. ${d.consequence_if_missed ? 'If missed: ' + d.consequence_if_missed : ''}`.trim(),
    color: deadlineColor(d),
    badge: deadlineKindBadge(d),
  }));
}

interface ReviewRow {
  id: string;
  title: string;
  output_kind: string;
  skill_id: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function buildReviewEvents(matterId: string): TimelineEvent[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT id, title, output_kind, skill_id, status, reviewed_by, reviewed_at, created_at
     FROM review_queue WHERE matter_id = ? ORDER BY created_at ASC`,
  ).all(matterId) as ReviewRow[];
  const out: TimelineEvent[] = [];
  for (const r of rows) {
    out.push({
      id: `review-created:${r.id}`,
      kind: 'review',
      at: r.created_at,
      title: `AI output queued — ${r.title}`,
      detail: `Skill: ${r.skill_id}. Kind: ${r.output_kind}. Status: ${r.status}.`,
      color: reviewColor(r.status),
      href: `/review/${r.id}`,
      badge: r.output_kind,
    });
    if (r.reviewed_at) {
      out.push({
        id: `review-decision:${r.id}`,
        kind: 'review',
        at: r.reviewed_at,
        title: `${r.status === 'approved' ? 'Approved' : 'Rejected'} — ${r.title}`,
        detail: `By ${r.reviewed_by ?? 'unknown'}.`,
        color: reviewColor(r.status),
        href: `/review/${r.id}`,
        badge: r.status,
      });
    }
  }
  return out;
}

function buildBillingEvents(matterId: string): TimelineEvent[] {
  const rows: BillingEntry[] = listMatterBilling(matterId, 500);
  return rows.map((b) => ({
    id: `billing:${b.id}`,
    kind: 'billing',
    at: b.created_at,
    title: b.kind === 'ai_run'
      ? `AI run — ${b.description}`
      : `Lawyer time — ${b.description}`,
    detail: b.kind === 'ai_run'
      ? `${b.duration_seconds}s · $${(b.cost_usd ?? 0).toFixed(2)} · skill ${b.actor_id}`
      : `${b.duration_seconds}s · ${b.actor_id}`,
    color: b.kind === 'ai_run' ? 'grey' : 'green',
    badge: b.kind,
  }));
}

function buildMatterCreatedEvent(matterId: string): TimelineEvent | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM matters WHERE id = ?`).get(matterId) as
    | Matter | undefined;
  if (!row) return null;
  return {
    id: `matter:${row.id}`,
    kind: 'matter_created',
    at: row.created_at,
    title: `Matter opened — ${row.matter_number}: ${row.title}`,
    detail: `Client ${row.client_name}. Type: ${row.matter_type}. Jurisdiction: ${row.jurisdiction}. Responsible: ${row.responsible_lawyer_email ?? '—'}.`,
    color: 'green',
    badge: 'opened',
  };
}

export function buildMatterTimeline(matterId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const created = buildMatterCreatedEvent(matterId);
  if (created) events.push(created);
  events.push(...buildAuditEvents(matterId));
  events.push(...buildDocumentEvents(matterId));
  events.push(...buildDeadlineEvents(matterId));
  events.push(...buildReviewEvents(matterId));
  events.push(...buildBillingEvents(matterId));
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

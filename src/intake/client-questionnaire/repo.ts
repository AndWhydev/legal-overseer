/**
 * Persistence for intake sessions and client briefs.
 *
 * Rows are stored with ISO-string timestamps and JSON-encoded blobs;
 * this module maps between the database rows and the rich domain types
 * in `types.ts` (Date objects, parsed records, arrays).
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createSafeLogger } from '../../governance/index.js';
import type {
  IntakeSession,
  IntakeStatus,
  MatterType,
  AustralianState,
  ClientBrief,
} from './types.js';

const logger = createSafeLogger('IntakeRepo');

interface IntakeSessionRow {
  id: string;
  client_email: string;
  client_name: string | null;
  firm_slug: string;
  matter_type: string;
  state: string | null;
  answers: string;
  current_question_index: number;
  status: IntakeStatus;
  started_at: string;
  completed_at: string | null;
  brief_generated: number;
  matter_id: string | null;
  urgency_flag: number;
  urgency_reason: string | null;
  last_question_sent_at: string | null;
  follow_up_sent: number;
  created_at: string;
}

function rowToSession(row: IntakeSessionRow): IntakeSession {
  let answers: Record<string, string> = {};
  try {
    answers = JSON.parse(row.answers) as Record<string, string>;
  } catch {
    answers = {};
  }
  return {
    id: row.id,
    clientEmail: row.client_email,
    clientName: row.client_name ?? '',
    firmSlug: row.firm_slug,
    matterType: row.matter_type as MatterType,
    state: (row.state ?? 'unknown') as AustralianState,
    answers,
    currentQuestionIndex: row.current_question_index,
    status: row.status,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    briefGenerated: row.brief_generated === 1,
    matterId: row.matter_id ?? undefined,
    urgencyFlag: row.urgency_flag === 1,
    urgencyReason: row.urgency_reason ?? undefined,
  };
}

export interface CreateIntakeSessionInput {
  clientEmail: string;
  clientName: string;
  firmSlug: string;
  matterType: MatterType;
  state?: AustralianState;
}

export function createIntakeSession(input: CreateIntakeSessionInput): IntakeSession {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO intake_sessions
       (id, client_email, client_name, firm_slug, matter_type, state, answers,
        current_question_index, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', 0, 'in-progress', ?, ?)`,
  ).run(
    id,
    input.clientEmail,
    input.clientName,
    input.firmSlug,
    input.matterType,
    input.state ?? null,
    now,
    now,
  );
  logger.info(`Created intake session ${id} (${input.matterType}) for ${input.clientEmail}`);
  return getIntakeSession(id) as IntakeSession;
}

export function getIntakeSession(id: string): IntakeSession | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM intake_sessions WHERE id = ?`).get(id) as
    | IntakeSessionRow
    | undefined;
  return row ? rowToSession(row) : null;
}

/** The most recent in-progress session for an email, if any. */
export function getActiveSessionByEmail(email: string): IntakeSession | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT * FROM intake_sessions
       WHERE client_email = ? AND status = 'in-progress'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(email) as IntakeSessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listIntakeSessions(status?: IntakeStatus): IntakeSession[] {
  const db = getDatabase();
  const rows = status
    ? (db
        .prepare(`SELECT * FROM intake_sessions WHERE status = ? ORDER BY started_at DESC`)
        .all(status) as IntakeSessionRow[])
    : (db.prepare(`SELECT * FROM intake_sessions ORDER BY started_at DESC`).all() as IntakeSessionRow[]);
  return rows.map(rowToSession);
}

export interface UpdateIntakeSessionPatch {
  answers?: Record<string, string>;
  currentQuestionIndex?: number;
  status?: IntakeStatus;
  state?: AustralianState;
  matterType?: MatterType;
  completedAt?: Date;
  briefGenerated?: boolean;
  matterId?: string;
  urgencyFlag?: boolean;
  urgencyReason?: string;
  lastQuestionSentAt?: Date;
  followUpSent?: boolean;
}

export function updateIntakeSession(id: string, patch: UpdateIntakeSessionPatch): IntakeSession | null {
  const db = getDatabase();
  const existing = getIntakeSession(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    values.push(val);
  };

  if (patch.answers !== undefined) set('answers', JSON.stringify(patch.answers));
  if (patch.currentQuestionIndex !== undefined) set('current_question_index', patch.currentQuestionIndex);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.state !== undefined) set('state', patch.state);
  if (patch.matterType !== undefined) set('matter_type', patch.matterType);
  if (patch.completedAt !== undefined) set('completed_at', patch.completedAt.toISOString());
  if (patch.briefGenerated !== undefined) set('brief_generated', patch.briefGenerated ? 1 : 0);
  if (patch.matterId !== undefined) set('matter_id', patch.matterId);
  if (patch.urgencyFlag !== undefined) set('urgency_flag', patch.urgencyFlag ? 1 : 0);
  if (patch.urgencyReason !== undefined) set('urgency_reason', patch.urgencyReason);
  if (patch.lastQuestionSentAt !== undefined) set('last_question_sent_at', patch.lastQuestionSentAt.toISOString());
  if (patch.followUpSent !== undefined) set('follow_up_sent', patch.followUpSent ? 1 : 0);

  if (sets.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE intake_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getIntakeSession(id);
}

/** Save an answer to a single question and return the updated session. */
export function saveAnswer(id: string, questionId: string, answer: string): IntakeSession | null {
  const session = getIntakeSession(id);
  if (!session) return null;
  const answers = { ...session.answers, [questionId]: answer };
  return updateIntakeSession(id, { answers });
}

// ─────────────────────────────────────────────────────────────────────
// Client briefs
// ─────────────────────────────────────────────────────────────────────

interface ClientBriefRow {
  id: string;
  session_id: string;
  client_name: string;
  client_email: string;
  matter_type: string;
  state: string | null;
  urgency_flag: number;
  urgency_reason: string | null;
  days_until_limitation: number | null;
  fact_summary: string | null;
  structured_facts: string | null;
  applicable_legislation: string | null;
  limitation_period: string | null;
  relevant_cases: string | null;
  recommended_first_steps: string | null;
  estimated_cost_range: string | null;
  risk_flags: string | null;
  full_transcript: string | null;
  matter_id: string | null;
  review_id: string | null;
  generated_at: string;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToBrief(row: ClientBriefRow): ClientBrief {
  return {
    sessionId: row.session_id,
    clientName: row.client_name,
    clientEmail: row.client_email,
    matterType: row.matter_type as MatterType,
    state: (row.state ?? 'unknown') as AustralianState,
    urgencyFlag: row.urgency_flag === 1,
    urgencyReason: row.urgency_reason ?? undefined,
    daysUntilLimitationPeriod: row.days_until_limitation ?? undefined,
    factSummary: row.fact_summary ?? '',
    structuredFacts: parseJson<Record<string, string>>(row.structured_facts, {}),
    applicableLegislation: parseJson<string[]>(row.applicable_legislation, []),
    limitationPeriod: row.limitation_period ?? '',
    relevantCases: parseJson<ClientBrief['relevantCases']>(row.relevant_cases, []),
    recommendedFirstSteps: parseJson<string[]>(row.recommended_first_steps, []),
    estimatedCostRange: row.estimated_cost_range ?? '',
    riskFlags: parseJson<string[]>(row.risk_flags, []),
    fullTranscript: parseJson<ClientBrief['fullTranscript']>(row.full_transcript, []),
    generatedAt: new Date(row.generated_at),
  };
}

export interface SaveBriefResult {
  id: string;
  brief: ClientBrief;
}

export function saveClientBrief(
  brief: ClientBrief,
  extra: { matterId?: string | null; reviewId?: string | null } = {},
): SaveBriefResult {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO client_briefs
       (id, session_id, client_name, client_email, matter_type, state,
        urgency_flag, urgency_reason, days_until_limitation, fact_summary,
        structured_facts, applicable_legislation, limitation_period,
        relevant_cases, recommended_first_steps, estimated_cost_range,
        risk_flags, full_transcript, matter_id, review_id, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    brief.sessionId,
    brief.clientName,
    brief.clientEmail,
    brief.matterType,
    brief.state,
    brief.urgencyFlag ? 1 : 0,
    brief.urgencyReason ?? null,
    brief.daysUntilLimitationPeriod ?? null,
    brief.factSummary,
    JSON.stringify(brief.structuredFacts),
    JSON.stringify(brief.applicableLegislation),
    brief.limitationPeriod,
    JSON.stringify(brief.relevantCases),
    JSON.stringify(brief.recommendedFirstSteps),
    brief.estimatedCostRange,
    JSON.stringify(brief.riskFlags),
    JSON.stringify(brief.fullTranscript),
    extra.matterId ?? null,
    extra.reviewId ?? null,
    brief.generatedAt.toISOString(),
  );
  logger.info(`Saved client brief ${id} for session ${brief.sessionId}`);
  return { id, brief };
}

export function getBriefBySession(sessionId: string): ClientBrief | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM client_briefs WHERE session_id = ? ORDER BY generated_at DESC LIMIT 1`)
    .get(sessionId) as ClientBriefRow | undefined;
  return row ? rowToBrief(row) : null;
}

export function getBriefByMatter(matterId: string): ClientBrief | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM client_briefs WHERE matter_id = ? ORDER BY generated_at DESC LIMIT 1`)
    .get(matterId) as ClientBriefRow | undefined;
  return row ? rowToBrief(row) : null;
}

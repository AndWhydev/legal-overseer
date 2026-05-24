/**
 * 3.2 — Automated Client Onboarding.
 *
 * State machine: started → conflict_check → engagement_letter →
 * awaiting_signature → awaiting_identity → awaiting_lawyer →
 * completed.
 *
 * Each transition pauses for the appropriate review (conflict check,
 * engagement letter approval, signature, identity verification) and
 * resumes when the dashboard reports the gate has passed.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';
import { enqueueForReview } from '../compliance/reviewGate.js';
import { runConflictCheck } from '../compliance/conflicts.js';
import { createMatter, nextMatterNumber } from '../db/repositories/matters.js';
import { getClient, setIdentityVerified, type Client } from '../clients/repo.js';
import { getTemplateBySlug } from '../templates/index.js';
import { createSignatureEnvelope, addSigner } from '../documents/esignature.js';

const logger = createSafeLogger('ClientOnboarding');

export type OnboardingStatus =
  | 'started'
  | 'conflict_check'
  | 'engagement_letter'
  | 'awaiting_signature'
  | 'awaiting_identity'
  | 'awaiting_lawyer'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ClientOnboarding {
  id: string;
  client_id: string;
  status: OnboardingStatus;
  conflict_check_id: string | null;
  engagement_letter_review_id: string | null;
  engagement_letter_signature_id: string | null;
  identity_verification_id: string | null;
  matter_id: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface StartOnboardingInput {
  clientId: string;
  matterTitle: string;
  matterType: string;
  jurisdiction?: string;
  responsibleLawyerEmail: string;
  acting: string;
}

export async function startClientOnboarding(
  input: StartOnboardingInput,
): Promise<ClientOnboarding> {
  const client = getClient(input.clientId);
  if (!client) throw new Error(`client ${input.clientId} not found`);

  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO client_onboardings
       (id, client_id, status, notes, created_at, updated_at)
     VALUES (?, ?, 'started', ?, ?, ?)`,
  ).run(
    id,
    input.clientId,
    `matter title: ${input.matterTitle}; matter type: ${input.matterType}`,
    now,
    now,
  );

  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'onboarding.start',
    detail: `client ${client.full_name}`,
    refTable: 'client_onboardings',
    refId: id,
  });

  // Create matter (status open) so conflict check has something to attach to.
  const matter = createMatter({
    matter_number: nextMatterNumber(),
    title: input.matterTitle,
    client_name: client.full_name,
    client_email: client.email,
    matter_type: input.matterType,
    jurisdiction: input.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
    responsible_lawyer_email: input.responsibleLawyerEmail,
    notes: `Onboarding ${id}`,
  });

  db.prepare(`UPDATE client_onboardings SET matter_id = ?, updated_at = ? WHERE id = ?`).run(
    matter.id,
    new Date().toISOString(),
    id,
  );

  // Step 1: Conflict check.
  const conflict = runConflictCheck({
    matterId: matter.id,
    newClientName: client.full_name,
    newClientEmail: client.email,
  });
  db.prepare(
    `UPDATE client_onboardings SET conflict_check_id = ?, status = ?, updated_at = ? WHERE id = ?`,
  ).run(
    conflict.id,
    conflict.match_count > 0 ? 'conflict_check' : 'engagement_letter',
    new Date().toISOString(),
    id,
  );

  // If clear, proceed to engagement letter.
  if (conflict.match_count === 0) {
    await draftEngagementLetter(id, input.acting);
  }

  return getOnboarding(id) as ClientOnboarding;
}

async function draftEngagementLetter(onboardingId: string, acting: string): Promise<void> {
  const onboarding = getOnboarding(onboardingId);
  if (!onboarding) return;
  const client = getClient(onboarding.client_id);
  if (!client) return;

  // Pick the engagement-letter template if available; otherwise build a minimal one.
  const template = getTemplateBySlug('engagement-letter');
  const body = template
    ? renderTemplate(template.body_markdown, { CLIENT_NAME: client.full_name })
    : defaultEngagementLetter(client);

  const review = enqueueForReview({
    matterId: onboarding.matter_id,
    matterNumber: null,
    skillId: 'client_onboarding',
    outputKind: 'drafted_document',
    title: `Engagement letter — ${client.full_name}`,
    bodyMarkdown: wrapWithDisclaimer(body),
    metadata: { kind: 'engagement_letter', onboarding_id: onboardingId, client_id: client.id },
  });

  const db = getDatabase();
  db.prepare(
    `UPDATE client_onboardings SET engagement_letter_review_id = ?, status = 'engagement_letter', updated_at = ? WHERE id = ?`,
  ).run(review.id, new Date().toISOString(), onboardingId);
  appendLegalAudit({
    matterId: onboarding.matter_id,
    actorId: acting,
    action: 'onboarding.engagement_letter_drafted',
    detail: client.full_name,
    refTable: 'client_onboardings',
    refId: onboardingId,
  });
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

function defaultEngagementLetter(client: Client): string {
  return `# Engagement Letter

Dear ${client.full_name},

Thank you for instructing our firm. This letter confirms the basis on
which we have agreed to act for you.

## Scope
[CONFIRM scope of work]

## Fees
[CONFIRM fee basis: hourly / fixed / capped]

## Costs disclosure
This engagement is subject to costs disclosure obligations under the
Legal Profession Uniform Law. Please ask if any aspect is unclear.

## Termination
Either party may terminate this engagement by giving reasonable notice
in writing.

Yours sincerely,

[FIRM PARTNER]`;
}

export async function approveEngagementLetter(
  onboardingId: string,
  acting: string,
): Promise<ClientOnboarding> {
  const onboarding = getOnboarding(onboardingId);
  if (!onboarding) throw new Error(`onboarding ${onboardingId} not found`);
  if (!onboarding.engagement_letter_review_id) throw new Error('no engagement letter drafted');
  const client = getClient(onboarding.client_id);
  if (!client) throw new Error('client missing');

  // Create signature envelope for the engagement letter.
  const envelope = createSignatureEnvelope({
    matterId: onboarding.matter_id ?? null,
    documentId: onboarding.engagement_letter_review_id,
    documentTitle: `Engagement letter — ${client.full_name}`,
    createdBy: acting,
  });
  if (client.email) {
    addSigner({
      envelopeId: envelope.id,
      signerName: client.full_name,
      signerEmail: client.email,
      role: 'client',
    });
  }
  const db = getDatabase();
  db.prepare(
    `UPDATE client_onboardings
       SET engagement_letter_signature_id = ?, status = 'awaiting_signature', updated_at = ?
     WHERE id = ?`,
  ).run(envelope.id, new Date().toISOString(), onboardingId);
  appendLegalAudit({
    matterId: onboarding.matter_id,
    actorId: acting,
    action: 'onboarding.signature_sent',
    detail: client.email ?? 'no email',
    refTable: 'client_onboardings',
    refId: onboardingId,
  });
  return getOnboarding(onboardingId) as ClientOnboarding;
}

export function notifySignatureComplete(onboardingId: string): ClientOnboarding {
  const db = getDatabase();
  const onboarding = getOnboarding(onboardingId);
  if (!onboarding) throw new Error(`onboarding ${onboardingId} not found`);
  db.prepare(
    `UPDATE client_onboardings SET status = 'awaiting_identity', updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), onboardingId);
  // Update client signed_at.
  const client = getClient(onboarding.client_id);
  if (client) {
    db.prepare(`UPDATE clients SET engagement_letter_signed_at = ?, updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      new Date().toISOString(),
      client.id,
    );
  }
  appendLegalAudit({
    matterId: onboarding.matter_id,
    actorId: 'signature-system',
    action: 'onboarding.signature_complete',
    detail: '',
    refTable: 'client_onboardings',
    refId: onboardingId,
  });
  return getOnboarding(onboardingId) as ClientOnboarding;
}

export function markIdentityVerified(onboardingId: string, acting: string): ClientOnboarding {
  const onboarding = getOnboarding(onboardingId);
  if (!onboarding) throw new Error(`onboarding ${onboardingId} not found`);
  setIdentityVerified(onboarding.client_id, acting);
  const db = getDatabase();
  db.prepare(
    `UPDATE client_onboardings SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), new Date().toISOString(), onboardingId);
  // Set client status to active.
  db.prepare(`UPDATE clients SET status = 'active', updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    onboarding.client_id,
  );
  appendLegalAudit({
    matterId: onboarding.matter_id,
    actorId: acting,
    action: 'onboarding.complete',
    detail: '',
    refTable: 'client_onboardings',
    refId: onboardingId,
  });
  logger.info(`onboarding ${onboardingId} complete`);
  return getOnboarding(onboardingId) as ClientOnboarding;
}

export function cancelOnboarding(onboardingId: string, acting: string, reason: string): ClientOnboarding {
  const db = getDatabase();
  db.prepare(
    `UPDATE client_onboardings SET status = 'cancelled', failure_reason = ?, updated_at = ? WHERE id = ?`,
  ).run(reason, new Date().toISOString(), onboardingId);
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'onboarding.cancel',
    detail: reason,
    refTable: 'client_onboardings',
    refId: onboardingId,
  });
  return getOnboarding(onboardingId) as ClientOnboarding;
}

export function getOnboarding(id: string): ClientOnboarding | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM client_onboardings WHERE id = ?').get(id) as
      | ClientOnboarding
      | undefined) ?? null
  );
}

export function listOnboardingsByStatus(status?: OnboardingStatus): ClientOnboarding[] {
  const db = getDatabase();
  if (status) {
    return db
      .prepare(`SELECT * FROM client_onboardings WHERE status = ? ORDER BY created_at DESC`)
      .all(status) as ClientOnboarding[];
  }
  return db
    .prepare(`SELECT * FROM client_onboardings ORDER BY created_at DESC LIMIT 100`)
    .all() as ClientOnboarding[];
}

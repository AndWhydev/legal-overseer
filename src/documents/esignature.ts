/**
 * 3.3 — Built-in electronic signatures.
 *
 * Each envelope groups a document with one or more signers. Each
 * signer gets a unique signing_token + per-signer URL. Signatures
 * captured in the browser (typed name + canvas drawing). Audit trail
 * records timestamp, IP, and signature payload (base64 PNG of the
 * canvas signature when supplied).
 *
 * DocuSign integration (section 7.2) plugs in via the same surface —
 * envelopes route to DocuSign when provider='docusign'.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';

const logger = createSafeLogger('ESignature');

export type EnvelopeStatus = 'draft' | 'sent' | 'completed' | 'declined' | 'voided' | 'expired';
export type SignerStatus = 'pending' | 'signed' | 'declined';

export interface SignatureEnvelope {
  id: string;
  matter_id: string | null;
  document_id: string;
  document_title: string;
  status: EnvelopeStatus;
  created_by: string;
  provider: 'builtin' | 'docusign';
  provider_envelope_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SignatureSigner {
  id: string;
  envelope_id: string;
  signer_name: string;
  signer_email: string;
  role: string;
  signing_token: string;
  status: SignerStatus;
  signed_at: string | null;
  signed_ip: string | null;
  signature_data: string | null;
  last_reminded_at: string | null;
  reminder_count: number;
}

export interface CreateEnvelopeInput {
  matterId: string | null;
  documentId: string;
  documentTitle: string;
  createdBy: string;
  provider?: 'builtin' | 'docusign';
}

export function createSignatureEnvelope(input: CreateEnvelopeInput): SignatureEnvelope {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO signature_envelopes
       (id, matter_id, document_id, document_title, status, created_by,
        provider, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
  ).run(
    id,
    input.matterId,
    input.documentId,
    input.documentTitle,
    input.createdBy,
    input.provider ?? 'builtin',
    now,
  );
  appendLegalAudit({
    matterId: input.matterId,
    actorId: input.createdBy,
    action: 'esign.envelope_created',
    detail: input.documentTitle,
    refTable: 'signature_envelopes',
    refId: id,
  });
  return getEnvelope(id) as SignatureEnvelope;
}

export interface AddSignerInput {
  envelopeId: string;
  signerName: string;
  signerEmail: string;
  role: string;
}

export function addSigner(input: AddSignerInput): SignatureSigner {
  const db = getDatabase();
  const id = randomUUID();
  const signing_token = randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO signature_signers
       (id, envelope_id, signer_name, signer_email, role, signing_token, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
  ).run(id, input.envelopeId, input.signerName, input.signerEmail, input.role, signing_token);
  return getSigner(id) as SignatureSigner;
}

export function sendEnvelope(envelopeId: string, acting: string): SignatureEnvelope {
  const env = getEnvelope(envelopeId);
  if (!env) throw new Error(`envelope ${envelopeId} not found`);
  if (env.status !== 'draft') throw new Error(`envelope is ${env.status}, cannot send`);
  const db = getDatabase();
  db.prepare(`UPDATE signature_envelopes SET status = 'sent' WHERE id = ?`).run(envelopeId);
  appendLegalAudit({
    matterId: env.matter_id,
    actorId: acting,
    action: 'esign.envelope_sent',
    detail: env.document_title,
    refTable: 'signature_envelopes',
    refId: envelopeId,
  });
  return getEnvelope(envelopeId) as SignatureEnvelope;
}

export interface RecordSignatureInput {
  signingToken: string;
  signatureData: string;
  signedIp: string;
}

export function recordSignature(input: RecordSignatureInput): SignatureSigner {
  const db = getDatabase();
  const signer = db
    .prepare('SELECT * FROM signature_signers WHERE signing_token = ?')
    .get(input.signingToken) as SignatureSigner | undefined;
  if (!signer) throw new Error('invalid signing token');
  if (signer.status !== 'pending') throw new Error(`already ${signer.status}`);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE signature_signers
       SET status = 'signed', signed_at = ?, signed_ip = ?, signature_data = ?
     WHERE id = ?`,
  ).run(now, input.signedIp, input.signatureData, signer.id);

  const envelope = getEnvelope(signer.envelope_id);
  if (envelope) {
    appendLegalAudit({
      matterId: envelope.matter_id,
      actorId: signer.signer_email,
      action: 'esign.signed',
      detail: `${signer.signer_name} signed ${envelope.document_title}`,
      refTable: 'signature_signers',
      refId: signer.id,
      metadata: { ip: input.signedIp, role: signer.role },
    });
  }

  const allSigners = db
    .prepare('SELECT * FROM signature_signers WHERE envelope_id = ?')
    .all(signer.envelope_id) as SignatureSigner[];
  if (allSigners.every((s) => s.status === 'signed')) {
    db.prepare(
      `UPDATE signature_envelopes SET status = 'completed', completed_at = ? WHERE id = ?`,
    ).run(now, signer.envelope_id);
    if (envelope) {
      appendLegalAudit({
        matterId: envelope.matter_id,
        actorId: 'esign-system',
        action: 'esign.envelope_completed',
        detail: envelope.document_title,
        refTable: 'signature_envelopes',
        refId: envelope.id,
      });
    }
  }
  return getSigner(signer.id) as SignatureSigner;
}

export function declineSignature(signingToken: string): SignatureSigner {
  const db = getDatabase();
  const signer = db
    .prepare('SELECT * FROM signature_signers WHERE signing_token = ?')
    .get(signingToken) as SignatureSigner | undefined;
  if (!signer) throw new Error('invalid signing token');
  db.prepare(
    `UPDATE signature_signers SET status = 'declined' WHERE id = ?`,
  ).run(signer.id);
  const envelope = getEnvelope(signer.envelope_id);
  if (envelope) {
    db.prepare(`UPDATE signature_envelopes SET status = 'declined' WHERE id = ?`).run(
      envelope.id,
    );
    appendLegalAudit({
      matterId: envelope.matter_id,
      actorId: signer.signer_email,
      action: 'esign.declined',
      detail: signer.signer_name,
      refTable: 'signature_signers',
      refId: signer.id,
    });
  }
  return getSigner(signer.id) as SignatureSigner;
}

export function getEnvelope(id: string): SignatureEnvelope | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM signature_envelopes WHERE id = ?').get(id) as
      | SignatureEnvelope
      | undefined) ?? null
  );
}

export function getSigner(id: string): SignatureSigner | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM signature_signers WHERE id = ?').get(id) as
      | SignatureSigner
      | undefined) ?? null
  );
}

export function getSignerByToken(token: string): SignatureSigner | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM signature_signers WHERE signing_token = ?').get(token) as
      | SignatureSigner
      | undefined) ?? null
  );
}

export function listEnvelopeSigners(envelopeId: string): SignatureSigner[] {
  const db = getDatabase();
  return db
    .prepare('SELECT * FROM signature_signers WHERE envelope_id = ?')
    .all(envelopeId) as SignatureSigner[];
}

export function listPendingEnvelopes(): SignatureEnvelope[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM signature_envelopes WHERE status IN ('draft', 'sent') ORDER BY created_at DESC`,
    )
    .all() as SignatureEnvelope[];
}

/**
 * Reminder scheduler entry-point. Increments reminder counter and
 * timestamps when a reminder is sent. Mailing is left to the caller
 * (we don't want to silently produce email volume from this module).
 */
export function recordReminderSent(signerId: string): SignatureSigner {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE signature_signers
       SET last_reminded_at = ?, reminder_count = reminder_count + 1
     WHERE id = ?`,
  ).run(now, signerId);
  return getSigner(signerId) as SignatureSigner;
}

/**
 * Find signers ready for a reminder (pending after 3d / 7d gap).
 * Returns signers + days since last action.
 */
export function findSignersDueReminder(): { signer: SignatureSigner; daysOutstanding: number }[] {
  const db = getDatabase();
  const all = db
    .prepare(
      `SELECT s.* FROM signature_signers s
       JOIN signature_envelopes e ON e.id = s.envelope_id
       WHERE s.status = 'pending' AND e.status = 'sent'`,
    )
    .all() as SignatureSigner[];
  const now = Date.now();
  const out: { signer: SignatureSigner; daysOutstanding: number }[] = [];
  for (const s of all) {
    const envelope = getEnvelope(s.envelope_id);
    if (!envelope) continue;
    const last = s.last_reminded_at ?? envelope.created_at;
    const daysOutstanding = (now - new Date(last).getTime()) / (24 * 3600 * 1000);
    if (s.reminder_count === 0 && daysOutstanding >= 3) {
      out.push({ signer: s, daysOutstanding: Math.floor(daysOutstanding) });
    } else if (s.reminder_count === 1 && daysOutstanding >= 4) {
      out.push({ signer: s, daysOutstanding: Math.floor(daysOutstanding) });
    }
  }
  return out;
}

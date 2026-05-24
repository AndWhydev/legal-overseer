/**
 * 8.1 — Outbound email with approval gate.
 *
 * Sends emails using the lawyer's own SMTP credentials so the email
 * appears to come from their actual address. Every email goes through
 * the review queue first.
 *
 * SMTP passwords are encrypted at rest using a key derived from
 * BACKUP_ENCRYPTION_PASSPHRASE — the same key we use for backup
 * encryption, since both are firm-controlled secrets.
 */

import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import nodemailer from 'nodemailer';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { assertApproved } from '../compliance/reviewGate.js';
import { getReviewById } from '../compliance/reviewGate.js';
import { getDocument, readDocumentBytes } from '../uploads/store.js';

const logger = createSafeLogger('OutboundEmail');

export interface LawyerEmailConfig {
  user_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password_encrypted: string;
  smtp_secure: number;
  from_address: string;
  from_name: string | null;
  verified_at: string | null;
  updated_at: string;
}

function encryptionKey(): Buffer {
  const phrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE ?? 'legal-overseer-default-passphrase-change-me';
  return scryptSync(phrase, Buffer.from('legal-overseer-smtp-v1'), 32);
}

function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptPassword(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export interface UpsertEmailConfigInput {
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure?: boolean;
  fromAddress: string;
  fromName?: string;
  acting: string;
}

export function upsertLawyerEmailConfig(input: UpsertEmailConfigInput): LawyerEmailConfig {
  const db = getDatabase();
  const enc = encryptPassword(input.smtpPassword);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO lawyer_email_configs
       (user_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted,
        smtp_secure, from_address, from_name, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.userId,
    input.smtpHost,
    input.smtpPort,
    input.smtpUser,
    enc,
    input.smtpSecure ? 1 : 0,
    input.fromAddress,
    input.fromName ?? null,
    now,
  );
  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'lawyer_email.configure',
    detail: `${input.fromAddress} via ${input.smtpHost}`,
    refTable: 'lawyer_email_configs',
    refId: input.userId,
  });
  return getLawyerEmailConfig(input.userId) as LawyerEmailConfig;
}

export function getLawyerEmailConfig(userId: string): LawyerEmailConfig | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM lawyer_email_configs WHERE user_id = ?').get(userId) as
      | LawyerEmailConfig
      | undefined) ?? null
  );
}

export async function verifyLawyerSmtp(userId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = getLawyerEmailConfig(userId);
  if (!cfg) return { ok: false, error: 'no SMTP config' };
  try {
    const t = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: cfg.smtp_port,
      secure: cfg.smtp_secure === 1,
      auth: { user: cfg.smtp_user, pass: decryptPassword(cfg.smtp_password_encrypted) },
    });
    await t.verify();
    const db = getDatabase();
    db.prepare(`UPDATE lawyer_email_configs SET verified_at = ? WHERE user_id = ?`).run(
      new Date().toISOString(),
      userId,
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface OutboundEmail {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  review_id: string;
  sent_by: string;
  from_address: string;
  to_addresses: string;
  cc_addresses: string | null;
  subject: string;
  body_markdown: string;
  attachment_ids: string | null;
  status: 'queued' | 'sent' | 'failed';
  message_id: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface QueueOutboundInput {
  matterId?: string | null;
  clientId?: string | null;
  reviewId: string;
  sentBy: string;
  fromAddress: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyMarkdown: string;
  attachmentIds?: string[];
}

export function queueOutboundEmail(input: QueueOutboundInput): OutboundEmail {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO outbound_emails
       (id, matter_id, client_id, review_id, sent_by, from_address,
        to_addresses, cc_addresses, subject, body_markdown, attachment_ids, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
  ).run(
    id,
    input.matterId ?? null,
    input.clientId ?? null,
    input.reviewId,
    input.sentBy,
    input.fromAddress,
    JSON.stringify(input.to),
    input.cc && input.cc.length ? JSON.stringify(input.cc) : null,
    input.subject,
    input.bodyMarkdown,
    input.attachmentIds && input.attachmentIds.length ? JSON.stringify(input.attachmentIds) : null,
  );
  return db.prepare('SELECT * FROM outbound_emails WHERE id = ?').get(id) as OutboundEmail;
}

export async function sendOutboundEmail(emailId: string, acting: string): Promise<OutboundEmail> {
  const db = getDatabase();
  const email = db.prepare('SELECT * FROM outbound_emails WHERE id = ?').get(emailId) as OutboundEmail | undefined;
  if (!email) throw new Error(`outbound email ${emailId} not found`);
  if (email.status !== 'queued') throw new Error(`email is ${email.status}`);

  // Hard gate.
  assertApproved(email.review_id);
  const review = getReviewById(email.review_id);

  const lawyerConfig = db
    .prepare(`SELECT * FROM lawyer_email_configs WHERE from_address = ?`)
    .get(email.from_address) as LawyerEmailConfig | undefined;
  if (!lawyerConfig) throw new Error(`no SMTP config for ${email.from_address}`);

  const transporter = nodemailer.createTransport({
    host: lawyerConfig.smtp_host,
    port: lawyerConfig.smtp_port,
    secure: lawyerConfig.smtp_secure === 1,
    auth: { user: lawyerConfig.smtp_user, pass: decryptPassword(lawyerConfig.smtp_password_encrypted) },
  });

  const attachments: nodemailer.SendMailOptions['attachments'] = [];
  if (email.attachment_ids && email.matter_id) {
    try {
      const ids = JSON.parse(email.attachment_ids) as string[];
      for (const aid of ids) {
        const doc = getDocument(email.matter_id, aid);
        if (doc) {
          attachments!.push({ filename: doc.filename, content: readDocumentBytes(doc) });
        }
      }
    } catch { /* ignore */ }
  }

  try {
    const info = await transporter.sendMail({
      from: lawyerConfig.from_name
        ? `${lawyerConfig.from_name} <${lawyerConfig.from_address}>`
        : lawyerConfig.from_address,
      to: (JSON.parse(email.to_addresses) as string[]).join(', '),
      cc: email.cc_addresses ? (JSON.parse(email.cc_addresses) as string[]).join(', ') : undefined,
      subject: email.subject,
      text: email.body_markdown,
      attachments,
    });
    db.prepare(
      `UPDATE outbound_emails SET status = 'sent', message_id = ?, sent_at = ? WHERE id = ?`,
    ).run(info.messageId ?? null, new Date().toISOString(), emailId);
    appendLegalAudit({
      matterId: email.matter_id,
      actorId: acting,
      action: 'outbound_email.sent',
      detail: `${email.subject} → ${email.to_addresses}`,
      refTable: 'outbound_emails',
      refId: emailId,
      metadata: { reviewId: email.review_id, messageId: info.messageId ?? null },
    });
    return db.prepare('SELECT * FROM outbound_emails WHERE id = ?').get(emailId) as OutboundEmail;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE outbound_emails SET status = 'failed', failure_reason = ? WHERE id = ?`,
    ).run(msg, emailId);
    appendLegalAudit({
      matterId: email.matter_id,
      actorId: acting,
      action: 'outbound_email.failed',
      detail: msg,
      refTable: 'outbound_emails',
      refId: emailId,
    });
    throw err;
  } finally {
    void review;
  }
}

export function listOutboundEmails(matterId?: string): OutboundEmail[] {
  const db = getDatabase();
  if (matterId) {
    return db
      .prepare(`SELECT * FROM outbound_emails WHERE matter_id = ? ORDER BY created_at DESC`)
      .all(matterId) as OutboundEmail[];
  }
  return db
    .prepare(`SELECT * FROM outbound_emails ORDER BY created_at DESC LIMIT 100`)
    .all() as OutboundEmail[];
}

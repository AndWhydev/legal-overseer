/**
 * 5.5 — Client SMS communication.
 *
 * Twilio integration when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are
 * set; otherwise dry-run mode (SMS is logged as 'pending' and never
 * delivered). Every SMS goes through the review queue. Opt-out
 * handling: STOP / UNSUB add the number to sms_opt_outs and any
 * subsequent attempts to send to that number are blocked.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { enqueueForReview, assertApproved } from '../compliance/reviewGate.js';
import { wrapWithDisclaimer } from '../compliance/disclaimer.js';

const logger = createSafeLogger('SMS');

export interface SmsMessage {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  to_number: string;
  from_number: string | null;
  body: string;
  review_id: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'blocked';
  provider_sid: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface DraftSmsInput {
  matterId?: string;
  clientId?: string;
  toNumber: string;
  body: string;
  authorEmail: string;
}

export function isOptedOut(phone: string): boolean {
  const db = getDatabase();
  return !!db.prepare('SELECT 1 FROM sms_opt_outs WHERE phone = ?').get(normalisePhone(phone));
}

export function recordOptOut(phone: string, reason?: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR IGNORE INTO sms_opt_outs (phone, reason) VALUES (?, ?)`,
  ).run(normalisePhone(phone), reason ?? null);
  appendLegalAudit({
    matterId: null,
    actorId: 'sms-system',
    action: 'sms.opt_out',
    detail: normalisePhone(phone),
    refTable: 'sms_opt_outs',
    refId: null,
    metadata: { reason: reason ?? null },
  });
  logger.info(`recorded SMS opt-out for ${normalisePhone(phone)}`);
}

function normalisePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function draftSms(input: DraftSmsInput): SmsMessage {
  const phone = normalisePhone(input.toNumber);
  if (isOptedOut(phone)) {
    throw new Error(`${phone} has opted out of SMS — refusing to draft`);
  }
  if (input.body.length > 1600) {
    throw new Error('SMS body too long (max 1600 chars)');
  }

  const body = `${input.body}\n\nReply STOP to opt out.`;

  const review = enqueueForReview({
    matterId: input.matterId ?? null,
    matterNumber: null,
    skillId: 'sms',
    outputKind: 'client_email',
    title: `SMS to ${phone}: ${input.body.slice(0, 60)}`,
    bodyMarkdown: wrapWithDisclaimer(`> [INTERNAL: this is an SMS draft, not an email]\n\n${body}`),
    metadata: { kind: 'sms', to: phone, client_id: input.clientId },
  });

  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO sms_messages
       (id, matter_id, client_id, to_number, body, review_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
  ).run(
    id,
    input.matterId ?? null,
    input.clientId ?? null,
    phone,
    body,
    review.id,
  );
  appendLegalAudit({
    matterId: input.matterId ?? null,
    actorId: input.authorEmail,
    action: 'sms.draft',
    detail: `to ${phone}: ${input.body.slice(0, 80)}`,
    refTable: 'sms_messages',
    refId: id,
  });
  return db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(id) as SmsMessage;
}

interface TwilioResponse {
  sid?: string;
  status?: string;
  error_message?: string;
}

async function sendViaTwilio(to: string, from: string, body: string): Promise<TwilioResponse> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) {
    return { status: 'dry-run', error_message: 'Twilio not configured' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body_ = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body_,
  });
  return (await res.json()) as TwilioResponse;
}

export async function sendSms(smsId: string, acting: string): Promise<SmsMessage> {
  const db = getDatabase();
  const sms = db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(smsId) as SmsMessage | undefined;
  if (!sms) throw new Error(`sms ${smsId} not found`);
  if (sms.status !== 'pending') throw new Error(`sms ${smsId} is ${sms.status}`);
  if (isOptedOut(sms.to_number)) {
    db.prepare(`UPDATE sms_messages SET status = 'blocked', failure_reason = 'opt-out' WHERE id = ?`).run(smsId);
    return db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(smsId) as SmsMessage;
  }

  // Hard gate: review must be approved.
  assertApproved(sms.review_id);

  const from = process.env.TWILIO_SMS_FROM ?? '';
  const now = new Date().toISOString();
  try {
    const result = await sendViaTwilio(sms.to_number, from, sms.body);
    const ok = result.sid && !result.error_message;
    db.prepare(
      `UPDATE sms_messages
         SET status = ?, provider_sid = ?, sent_at = ?, failure_reason = ?,
             from_number = ?
       WHERE id = ?`,
    ).run(
      ok ? 'sent' : 'failed',
      result.sid ?? null,
      now,
      result.error_message ?? null,
      from,
      smsId,
    );
    appendLegalAudit({
      matterId: sms.matter_id,
      actorId: acting,
      action: ok ? 'sms.sent' : 'sms.failed',
      detail: `to ${sms.to_number}`,
      refTable: 'sms_messages',
      refId: smsId,
      metadata: { sid: result.sid, error: result.error_message ?? null },
    });
  } catch (err) {
    db.prepare(
      `UPDATE sms_messages SET status = 'failed', failure_reason = ? WHERE id = ?`,
    ).run(err instanceof Error ? err.message : String(err), smsId);
  }
  return db.prepare('SELECT * FROM sms_messages WHERE id = ?').get(smsId) as SmsMessage;
}

export function listMatterSms(matterId: string): SmsMessage[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM sms_messages WHERE matter_id = ? ORDER BY created_at DESC`)
    .all(matterId) as SmsMessage[];
}

/**
 * Twilio status webhook handler — call from the dashboard route. Looks
 * up by provider_sid and updates status + delivered_at.
 */
export function handleTwilioWebhook(payload: { MessageSid?: string; MessageStatus?: string; From?: string; Body?: string }): void {
  if (payload.Body && /^\s*(stop|unsub|unsubscribe)\b/i.test(payload.Body) && payload.From) {
    recordOptOut(payload.From, 'inbound STOP');
    return;
  }
  if (!payload.MessageSid) return;
  const db = getDatabase();
  const now = new Date().toISOString();
  const status = payload.MessageStatus ?? '';
  let mapped: SmsMessage['status'] = 'sent';
  if (status === 'delivered') mapped = 'delivered';
  else if (status === 'failed' || status === 'undelivered') mapped = 'failed';
  db.prepare(
    `UPDATE sms_messages SET status = ?, delivered_at = ? WHERE provider_sid = ?`,
  ).run(mapped, mapped === 'delivered' ? now : null, payload.MessageSid);
}

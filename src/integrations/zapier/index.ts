/**
 * 7.5 — Zapier-compatible webhooks.
 *
 * Outbound: webhook_subscriptions register endpoint_url+secret per
 * event_kind. emitWebhookEvent() loops through active subscriptions
 * and POSTs the event payload + an HMAC signature header.
 *
 * Inbound: handleIncomingWebhook() processes Zapier-triggered events
 * (create matter, create task, send notification). Authenticated with
 * an API key (see api/keys.ts).
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createSafeLogger } from '../../governance/index.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import { createMatter, nextMatterNumber } from '../../db/repositories/matters.js';
import { postMessage } from '../../collaboration/matter-chat.js';

const logger = createSafeLogger('Zapier');

export const SUPPORTED_EVENTS = [
  'matter.opened',
  'matter.closed',
  'document.uploaded',
  'approval.completed',
  'invoice.sent',
  'payment.received',
] as const;
export type WebhookEvent = (typeof SUPPORTED_EVENTS)[number];

export interface WebhookSubscription {
  id: string;
  api_key_id: string;
  event_kind: string;
  endpoint_url: string;
  secret: string | null;
  active: number;
  created_at: string;
}

export function subscribe(input: { apiKeyId: string; eventKind: WebhookEvent; endpointUrl: string; secret?: string }): WebhookSubscription {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO webhook_subscriptions (id, api_key_id, event_kind, endpoint_url, secret)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.apiKeyId, input.eventKind, input.endpointUrl, input.secret ?? null);
  appendLegalAudit({
    matterId: null,
    actorId: input.apiKeyId,
    action: 'webhook.subscribe',
    detail: `${input.eventKind} → ${input.endpointUrl}`,
    refTable: 'webhook_subscriptions',
    refId: id,
  });
  return db.prepare('SELECT * FROM webhook_subscriptions WHERE id = ?').get(id) as WebhookSubscription;
}

export function listSubscriptions(apiKeyId?: string): WebhookSubscription[] {
  const db = getDatabase();
  if (apiKeyId) {
    return db
      .prepare(`SELECT * FROM webhook_subscriptions WHERE api_key_id = ? ORDER BY event_kind`)
      .all(apiKeyId) as WebhookSubscription[];
  }
  return db
    .prepare(`SELECT * FROM webhook_subscriptions WHERE active = 1 ORDER BY event_kind`)
    .all() as WebhookSubscription[];
}

export function unsubscribe(id: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE webhook_subscriptions SET active = 0 WHERE id = ?`).run(id);
}

export async function emitWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<{ delivered: number; failed: number }> {
  const db = getDatabase();
  const subs = db
    .prepare(`SELECT * FROM webhook_subscriptions WHERE event_kind = ? AND active = 1`)
    .all(event) as WebhookSubscription[];

  let delivered = 0;
  let failed = 0;
  for (const sub of subs) {
    const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (sub.secret) {
      const sig = createHmac('sha256', sub.secret).update(body).digest('hex');
      headers['x-legal-overseer-signature'] = `sha256=${sig}`;
    }
    let status: number | undefined;
    try {
      const res = await fetch(sub.endpoint_url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
      status = res.status;
      if (res.ok) delivered += 1;
      else failed += 1;
    } catch (err) {
      logger.warn(`webhook ${event} → ${sub.endpoint_url} failed: ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
    db.prepare(
      `INSERT INTO webhook_events (id, api_key_id, event_kind, direction, endpoint, payload_json, response_status, delivered_at)
       VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      sub.api_key_id,
      event,
      sub.endpoint_url,
      body,
      status ?? null,
      status && status < 400 ? new Date().toISOString() : null,
    );
  }
  return { delivered, failed };
}

export interface IncomingWebhookInput {
  apiKeyId: string;
  signature?: string | null;
  rawBody: string;
  expectedSecret?: string | null;
}

export interface IncomingWebhookPayload {
  action: 'create_matter' | 'create_task' | 'send_notification';
  params: Record<string, unknown>;
}

export function verifyIncomingSignature(rawBody: string, signature: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return true;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.replace(/^sha256=/, '');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

export async function handleIncomingWebhook(input: IncomingWebhookInput): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!verifyIncomingSignature(input.rawBody, input.signature ?? null, input.expectedSecret ?? null)) {
    return { ok: false, error: 'invalid signature' };
  }
  let payload: IncomingWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as IncomingWebhookPayload;
  } catch (err) {
    return { ok: false, error: 'invalid JSON' };
  }
  const db = getDatabase();
  db.prepare(
    `INSERT INTO webhook_events (id, api_key_id, event_kind, direction, payload_json)
     VALUES (?, ?, ?, 'inbound', ?)`,
  ).run(randomUUID(), input.apiKeyId, payload.action, input.rawBody);

  switch (payload.action) {
    case 'create_matter': {
      const p = payload.params as { title: string; client_name: string; client_email?: string; matter_type: string; jurisdiction?: string; responsible_lawyer_email?: string };
      const matter = createMatter({
        matter_number: nextMatterNumber(),
        title: p.title,
        client_name: p.client_name,
        client_email: p.client_email,
        matter_type: p.matter_type,
        jurisdiction: p.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
        responsible_lawyer_email: p.responsible_lawyer_email,
        notes: 'Created via Zapier inbound webhook',
      });
      return { ok: true, result: { matter_id: matter.id, matter_number: matter.matter_number } };
    }
    case 'create_task': {
      const p = payload.params as { matter_id: string; description: string; assignee?: string; due_date?: string };
      const msg = postMessage({
        matterId: p.matter_id,
        authorEmail: 'zapier-webhook',
        body: p.description,
        isActionItem: true,
        actionAssignee: p.assignee,
        actionDueDate: p.due_date,
      });
      return { ok: true, result: { message_id: msg.id } };
    }
    case 'send_notification': {
      return { ok: true, result: { queued: true } };
    }
    default:
      return { ok: false, error: 'unsupported action' };
  }
}

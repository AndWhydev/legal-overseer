/**
 * Processed-emails repository.
 *
 * Backs the dedupe + audit trail for src/inbox-monitor. The unique
 * (inbox_type, message_id) index means createProcessedEmail is safe to
 * call from multiple polling cycles — a duplicate insert throws and
 * the caller treats that as "already processed".
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ProcessedEmailRepo');

/**
 * Legal Overseer inbox slots:
 *   - legal_intake — new-matter intake, drives matter creation
 *   - client       — ongoing client correspondence on existing matters
 *   - court        — court / tribunal / regulator correspondence
 *   - internal     — internal firm operations (admin, billing, IT)
 */
export type InboxType = 'legal_intake' | 'client' | 'court' | 'internal';
export type ProcessedEmailStatus = 'routed' | 'failed' | 'skipped';

export interface ProcessedEmail {
  id: string;
  inbox_type: InboxType;
  inbox_address: string;
  imap_uid: number;
  message_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  attachment_count: number;
  attachments_dir: string | null;
  routed_task_id: string | null;
  routed_matter_id: string | null;
  status: ProcessedEmailStatus;
  error_message: string | null;
  reply_sent: number;
  created_at: string;
}

export interface CreateProcessedEmailInput {
  inbox_type: InboxType;
  inbox_address: string;
  imap_uid: number;
  message_id: string;
  from_address: string;
  from_name?: string | null;
  subject?: string | null;
  received_at: string;
  attachment_count: number;
  attachments_dir?: string | null;
  routed_task_id?: string | null;
  routed_matter_id?: string | null;
  status: ProcessedEmailStatus;
  error_message?: string | null;
  reply_sent: boolean;
}

export function isEmailProcessed(inboxType: InboxType, messageId: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT 1 AS n FROM processed_emails WHERE inbox_type = ? AND message_id = ? LIMIT 1`,
    )
    .get(inboxType, messageId) as { n: number } | undefined;
  return Boolean(row);
}

export function createProcessedEmail(input: CreateProcessedEmailInput): ProcessedEmail {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO processed_emails (
      id, inbox_type, inbox_address, imap_uid, message_id,
      from_address, from_name, subject, received_at,
      attachment_count, attachments_dir,
      routed_task_id, routed_matter_id, status, error_message,
      reply_sent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.inbox_type,
    input.inbox_address,
    input.imap_uid,
    input.message_id,
    input.from_address,
    input.from_name ?? null,
    input.subject ?? null,
    input.received_at,
    input.attachment_count,
    input.attachments_dir ?? null,
    input.routed_task_id ?? null,
    input.routed_matter_id ?? null,
    input.status,
    input.error_message ?? null,
    input.reply_sent ? 1 : 0,
    now,
  );

  logger.info(
    `Recorded inbox ${input.inbox_type} msg ${input.imap_uid} from ${input.from_address} → ${input.status}`,
  );

  return {
    id,
    inbox_type: input.inbox_type,
    inbox_address: input.inbox_address,
    imap_uid: input.imap_uid,
    message_id: input.message_id,
    from_address: input.from_address,
    from_name: input.from_name ?? null,
    subject: input.subject ?? null,
    received_at: input.received_at,
    attachment_count: input.attachment_count,
    attachments_dir: input.attachments_dir ?? null,
    routed_task_id: input.routed_task_id ?? null,
    routed_matter_id: input.routed_matter_id ?? null,
    status: input.status,
    error_message: input.error_message ?? null,
    reply_sent: input.reply_sent ? 1 : 0,
    created_at: now,
  };
}

export function listRecentProcessed(inboxType?: InboxType, limit = 50): ProcessedEmail[] {
  const db = getDatabase();
  if (inboxType) {
    return db
      .prepare(
        `SELECT * FROM processed_emails WHERE inbox_type = ? ORDER BY received_at DESC LIMIT ?`,
      )
      .all(inboxType, limit) as ProcessedEmail[];
  }
  return db
    .prepare(`SELECT * FROM processed_emails ORDER BY received_at DESC LIMIT ?`)
    .all(limit) as ProcessedEmail[];
}

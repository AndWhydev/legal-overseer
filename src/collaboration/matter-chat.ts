/**
 * 5.1 — Internal matter chat.
 *
 * Threaded discussion per matter — internal only, never visible to
 * clients. Messages support @mentions, document attachments, and
 * action-item flags with assignee + due date.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { sendNotification } from '../email/notifier.js';
import { getMatterById } from '../db/repositories/matters.js';
import { getUserByEmail } from '../users/repo.js';

const logger = createSafeLogger('MatterChat');

export interface MatterChatMessage {
  id: string;
  matter_id: string;
  author_email: string;
  body: string;
  mentions_json: string | null;
  attached_doc_ids: string | null;
  is_action_item: number;
  action_assignee: string | null;
  action_due_date: string | null;
  action_completed_at: string | null;
  created_at: string;
}

export interface PostMessageInput {
  matterId: string;
  authorEmail: string;
  body: string;
  mentions?: string[];
  attachedDocIds?: string[];
  isActionItem?: boolean;
  actionAssignee?: string;
  actionDueDate?: string;
}

function extractMentions(body: string): string[] {
  const out: string[] = [];
  const re = /@([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(m[1].toLowerCase());
  return Array.from(new Set(out));
}

export function postMessage(input: PostMessageInput): MatterChatMessage {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const mentions = (input.mentions ?? extractMentions(input.body));
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO matter_chat_messages
       (id, matter_id, author_email, body, mentions_json, attached_doc_ids,
        is_action_item, action_assignee, action_due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    input.authorEmail,
    input.body,
    mentions.length ? JSON.stringify(mentions) : null,
    input.attachedDocIds && input.attachedDocIds.length ? JSON.stringify(input.attachedDocIds) : null,
    input.isActionItem ? 1 : 0,
    input.actionAssignee ?? null,
    input.actionDueDate ?? null,
  );

  for (const mentioned of mentions) {
    const u = getUserByEmail(mentioned);
    if (u && u.email !== input.authorEmail) {
      sendNotification(
        `[Chat] You were @mentioned on ${matter.matter_number}`,
        `<p><b>${input.authorEmail}</b> mentioned you on ${matter.matter_number}.</p><blockquote>${input.body}</blockquote>`,
        u.email,
      ).catch(() => undefined);
    }
  }
  if (input.isActionItem && input.actionAssignee && input.actionAssignee !== input.authorEmail) {
    sendNotification(
      `[Action] ${matter.matter_number} action assigned`,
      `<p><b>${input.authorEmail}</b> assigned you an action item on ${matter.matter_number}${input.actionDueDate ? ' (due ' + input.actionDueDate + ')' : ''}.</p><blockquote>${input.body}</blockquote>`,
      input.actionAssignee,
    ).catch(() => undefined);
  }

  appendLegalAudit({
    matterId: matter.id,
    actorId: input.authorEmail,
    action: 'chat.post',
    detail: input.body.slice(0, 200),
    refTable: 'matter_chat_messages',
    refId: id,
    metadata: { mentions, isActionItem: !!input.isActionItem },
  });
  return getMessage(id) as MatterChatMessage;
}

export function getMessage(id: string): MatterChatMessage | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM matter_chat_messages WHERE id = ?').get(id) as
      | MatterChatMessage
      | undefined) ?? null
  );
}

export function listMatterChat(matterId: string, limit = 200): MatterChatMessage[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM matter_chat_messages WHERE matter_id = ? ORDER BY created_at ASC LIMIT ?`,
    )
    .all(matterId, limit) as MatterChatMessage[];
}

export function completeActionItem(messageId: string, acting: string): MatterChatMessage {
  const db = getDatabase();
  const msg = getMessage(messageId);
  if (!msg) throw new Error(`message ${messageId} not found`);
  if (!msg.is_action_item) throw new Error('message is not an action item');
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE matter_chat_messages SET action_completed_at = ? WHERE id = ?`,
  ).run(now, messageId);
  appendLegalAudit({
    matterId: msg.matter_id,
    actorId: acting,
    action: 'chat.action_completed',
    detail: msg.body.slice(0, 200),
    refTable: 'matter_chat_messages',
    refId: messageId,
  });
  return getMessage(messageId) as MatterChatMessage;
}

export function listActionItemsForUser(email: string, includeCompleted = false): MatterChatMessage[] {
  const db = getDatabase();
  const clause = includeCompleted ? '' : 'AND action_completed_at IS NULL';
  return db
    .prepare(
      `SELECT * FROM matter_chat_messages
       WHERE action_assignee = ? AND is_action_item = 1 ${clause}
       ORDER BY action_due_date ASC NULLS LAST, created_at DESC`,
    )
    .all(email) as MatterChatMessage[];
}

/**
 * Per-message router.
 *
 * Sits between the IMAP client and the per-inbox pipeline handler.
 * Responsibilities:
 *   1. Dedupe against the processed_emails table (a re-poll of the
 *      same UID should be a no-op).
 *   2. Invoke the pipeline handler.
 *   3. Send the auto-reply (best-effort; never fatal).
 *   4. Record the outcome in processed_emails.
 *   5. Signal back to the IMAP client whether to mark \Seen.
 *
 * The router never throws — every failure becomes a status='failed'
 * row so the operator can see why a message wasn't routed and the
 * IMAP message stays unread for retry on the next poll.
 */

import { createSafeLogger } from '../governance/index.js';
import {
  createProcessedEmail,
  isEmailProcessed,
} from '../db/repositories/processedEmails.js';
import { getPipelineHandler } from './pipelines/index.js';
import { sendAutoReply } from './reply.js';
import type { IncomingEmail } from './types.js';

const logger = createSafeLogger('InboxMonitor.Router');

export interface RouteOutcome {
  markSeen: boolean;
  status: 'routed' | 'failed' | 'skipped';
  taskId?: string;
  matterId?: string;
  matterNumber?: string;
  error?: string;
}

export async function routeEmail(email: IncomingEmail): Promise<RouteOutcome> {
  const inboxType = email.inbox.meta.type;

  if (isEmailProcessed(inboxType, email.messageId)) {
    logger.info(`Inbox ${inboxType} uid=${email.uid}: already processed (msg-id ${email.messageId}); marking seen.`);
    return { markSeen: true, status: 'skipped' };
  }

  const handler = getPipelineHandler(inboxType);
  let result;
  try {
    result = await handler(email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline ${inboxType} threw for uid=${email.uid}: ${msg}`);
    persistProcessed(email, {
      status: 'failed',
      error: msg,
      reply_sent: false,
    });
    return { markSeen: false, status: 'failed', error: msg };
  }

  const replySent = result.suppressAutoReply ? false : await sendAutoReply(email, result);

  const status = result.success ? 'routed' : 'failed';
  persistProcessed(email, {
    status,
    error: result.error ?? null,
    reply_sent: replySent,
    taskId: result.taskId,
    matterId: result.matterId,
  });

  return {
    markSeen: result.success,
    status,
    taskId: result.taskId,
    matterId: result.matterId,
    matterNumber: result.matterNumber,
    error: result.error,
  };
}

function persistProcessed(
  email: IncomingEmail,
  extras: {
    status: 'routed' | 'failed' | 'skipped';
    error: string | null;
    reply_sent: boolean;
    taskId?: string;
    matterId?: string;
  },
): void {
  try {
    createProcessedEmail({
      inbox_type: email.inbox.meta.type,
      inbox_address: email.inbox.address,
      imap_uid: email.uid,
      message_id: email.messageId,
      from_address: email.fromAddress,
      from_name: email.fromName,
      subject: email.subject,
      received_at: email.receivedAt,
      attachment_count: email.attachments.length,
      attachments_dir: email.attachmentsDir,
      routed_task_id: extras.taskId ?? null,
      routed_matter_id: extras.matterId ?? null,
      status: extras.status,
      error_message: extras.error,
      reply_sent: extras.reply_sent,
    });
  } catch (err) {
    logger.warn(
      `processed_emails insert failed for ${email.inbox.meta.type} uid=${email.uid}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

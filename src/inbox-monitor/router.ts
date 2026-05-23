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
  projectId?: string;
  error?: string;
}

/**
 * Route one parsed email. Always resolves — failures are reported via
 * the returned RouteOutcome.
 */
export async function routeEmail(email: IncomingEmail): Promise<RouteOutcome> {
  const inboxType = email.inbox.meta.type;

  // 1. Dedupe.
  if (isEmailProcessed(inboxType, email.messageId)) {
    logger.info(`Inbox ${inboxType} uid=${email.uid}: already processed (msg-id ${email.messageId}); marking seen.`);
    return { markSeen: true, status: 'skipped' };
  }

  // 2. Run the pipeline.
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

  // 3. Send auto-reply (success OR failure — the sender deserves an
  //    acknowledgment either way; the body is built from the result).
  const replySent = await sendAutoReply(email, result);

  // 4. Persist + return.
  const status = result.success ? 'routed' : 'failed';
  persistProcessed(email, {
    status,
    error: result.error ?? null,
    reply_sent: replySent,
    taskId: result.taskId,
    projectId: result.projectId,
  });

  // 5. Only mark seen when the pipeline succeeded. Failed messages
  //    stay unread so the next poll cycle gets another go after the
  //    operator fixes the underlying issue.
  return {
    markSeen: result.success,
    status,
    taskId: result.taskId,
    projectId: result.projectId,
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
    projectId?: string;
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
      routed_project_id: extras.projectId ?? null,
      status: extras.status,
      error_message: extras.error,
      reply_sent: extras.reply_sent,
    });
  } catch (err) {
    // UNIQUE constraint or other DB error — log but don't propagate.
    // A duplicate row means another poll won the race; we still want
    // to mark \Seen via the original outcome.
    logger.warn(
      `processed_emails insert failed for ${email.inbox.meta.type} uid=${email.uid}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

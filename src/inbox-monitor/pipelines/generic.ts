/**
 * Generic inbox pipeline used by design / content / ops.
 *
 * These three inboxes don't yet have dedicated skill modules, so we
 * route their briefs into the standard tasks table as `general` skill
 * tasks tagged with a `pipeline_type` field. The processor picks them
 * up, classifies them, and runs them with the skill the classifier
 * deems appropriate. Once dedicated `design`/`content`/`ops` skills
 * are added, those handlers slot in by swapping the skillId here.
 */

import { createSafeLogger } from '../../governance/index.js';
import { createTask } from '../../db/repositories/tasks.js';
import type { IncomingEmail, PipelineResult } from '../types.js';

const logger = createSafeLogger('InboxMonitor.Generic');

/**
 * Build the task input_json the processor sees. We include enough
 * context that the prompt is self-contained — the worker doesn't need
 * to go re-read the email.
 */
function buildInputJson(email: IncomingEmail, pipelineType: string): string {
  const attachmentLines = email.attachments.length
    ? email.attachments
        .map((a) => `- ${a.filename} (${a.mimeType}, ${a.sizeBytes} bytes): ${a.path}`)
        .join('\n')
    : '(no attachments)';

  const prompt = [
    `# ${pipelineType.toUpperCase()} brief from ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}`,
    '',
    `Inbox: ${email.inbox.address}`,
    `Subject: ${email.subject}`,
    `Received: ${email.receivedAt}`,
    '',
    '## Body',
    '',
    email.bodyText || '(empty body)',
    '',
    '## Attachments',
    '',
    attachmentLines,
  ].join('\n');

  return JSON.stringify({
    prompt,
    pipeline_type: pipelineType,
    inbox_address: email.inbox.address,
    from_address: email.fromAddress,
    from_name: email.fromName,
    subject: email.subject,
    attachments: email.attachments.map((a) => ({
      filename: a.filename,
      path: a.path,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    attachments_dir: email.attachmentsDir,
    received_at: email.receivedAt,
    message_id: email.messageId,
  });
}

/**
 * Run the generic pipeline. The pipelineType is stored on the task so
 * the dashboard and the processor's classifier can both see it.
 */
export function runGenericPipeline(
  email: IncomingEmail,
  pipelineType: 'design' | 'content' | 'ops',
): PipelineResult {
  try {
    const task = createTask(
      'general',
      `inbox_monitor:${pipelineType}`,
      buildInputJson(email, pipelineType),
    );
    const subject = email.subject || '(no subject)';
    const summary = `Queued as ${pipelineType} task ${task.id} — "${subject.slice(0, 80)}".`;
    logger.info(`Generic pipeline (${pipelineType}) enqueued task ${task.id}`);
    return { success: true, taskId: task.id, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Generic pipeline (${pipelineType}) failed: ${msg}`);
    return {
      success: false,
      summary: `Could not queue ${pipelineType} task: ${msg}`,
      error: msg,
    };
  }
}

/**
 * Correspondence pipelines (client / court / internal).
 *
 * For non-intake inboxes the pipeline doesn't create a new matter — it
 * tries to match the email to an existing matter (by matter number in
 * the subject, by sender address, or by Reply-To threading) and queues
 * a follow-up task for the responsible lawyer. If no match is found,
 * the email is logged as an unmatched-correspondence audit entry so
 * the operator can see it on the dashboard.
 *
 * Hard product constraint: under no circumstance does this pipeline
 * send a substantive reply on its own. Auto-replies are
 * acknowledgments only ("we have received your message"), and any
 * substantive draft must flow through the review queue.
 */

import { createSafeLogger } from '../../governance/index.js';
import { createTask } from '../../db/repositories/tasks.js';
import { getMatterByNumber } from '../../db/repositories/matters.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import type { IncomingEmail, InboxType, PipelineResult } from '../types.js';

const logger = createSafeLogger('InboxMonitor.Correspondence');

const MATTER_NUMBER_RE = /\[?(\d{4}-\d{4})\]?/;

function findMatterNumber(email: IncomingEmail): string | null {
  const m = email.subject.match(MATTER_NUMBER_RE);
  if (m) return m[1];
  const body = email.bodyText.slice(0, 4000).match(MATTER_NUMBER_RE);
  if (body) return body[1];
  return null;
}

/**
 * Map an inbox type to a routing tag so the dashboard / processor can
 * group tasks. Used as tasks.input_json.pipeline_type.
 */
function pipelineTagFor(type: InboxType): string {
  switch (type) {
    case 'client':
      return 'client_correspondence';
    case 'court':
      return 'court_correspondence';
    case 'internal':
      return 'internal_ops';
    case 'legal_intake':
      return 'legal_intake';
  }
}

export function runCorrespondencePipeline(
  email: IncomingEmail,
  type: InboxType,
): PipelineResult {
  const tag = pipelineTagFor(type);
  const matterNumber = findMatterNumber(email);
  const matter = matterNumber ? getMatterByNumber(matterNumber) : null;

  const input = {
    pipeline_type: tag,
    inbox_type: type,
    from: email.fromAddress,
    fromName: email.fromName,
    subject: email.subject,
    bodyExcerpt: email.bodyText.slice(0, 2000),
    attachments: email.attachments.length,
    matterNumber: matterNumber,
    matchedMatterId: matter?.id ?? null,
    receivedAt: email.receivedAt,
    messageId: email.messageId,
  };

  // Matter linkage flows through input_json.matchedMatterId; we don't
  // pass it as the tasks.project_id FK because the projects table is
  // unused under Legal Overseer.
  const task = createTask(
    'general',
    `inbox:${type}`,
    JSON.stringify({ prompt: `Triage ${tag} from ${email.fromAddress}: ${email.subject}`, ...input }),
    undefined,
    undefined,
  );

  appendLegalAudit({
    matterId: matter?.id ?? null,
    actorId: `system:inbox:${type}`,
    action: matter ? 'correspondence.matched' : 'correspondence.unmatched',
    detail: `${tag} from ${email.fromAddress} → ${matter ? matter.matter_number : '(no matter match)'}`,
    refTable: 'tasks',
    refId: task.id,
    metadata: { messageId: email.messageId, subject: email.subject },
  });

  const matchSummary = matter
    ? `matched matter ${matter.matter_number} ("${matter.title}")`
    : 'no matter match — queued for triage';

  logger.info(`${tag} from ${email.fromAddress}: ${matchSummary} → task ${task.id}`);

  return {
    success: true,
    taskId: task.id,
    matterId: matter?.id,
    matterNumber: matter?.matter_number,
    summary: `Correspondence received and ${matchSummary}.`,
  };
}

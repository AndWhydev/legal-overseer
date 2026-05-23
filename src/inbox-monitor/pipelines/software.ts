/**
 * SOFTWARE inbox pipeline.
 *
 * Incoming brief → scope-intake. Two paths:
 *
 *   1. If the email has a scope-doc attachment (.md / .markdown / .txt
 *      / .docx) we treat the first such attachment as the canonical
 *      scope doc and ingest it via intake/ingestor.
 *
 *   2. Otherwise we materialise the email body as a Markdown scope doc
 *      in ~/inbox (or INBOX_DIR) so the existing intake watcher picks
 *      it up — and we also call ingestScopeFile directly so the reply
 *      can quote the resulting project id immediately.
 *
 * In both cases we end up with a Project row + scaffolded folder,
 * which the overseer's regular tick will then drive.
 */

import { copyFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { createSafeLogger } from '../../governance/index.js';
import {
  ensureInboxDir,
  ingestScopeFile,
  isScopeDocCandidate,
} from '../../intake/index.js';
import type { IncomingEmail, PipelineResult, SavedAttachment } from '../types.js';

const logger = createSafeLogger('InboxMonitor.Software');

function pickScopeAttachment(attachments: SavedAttachment[]): SavedAttachment | null {
  for (const att of attachments) {
    if (isScopeDocCandidate(att.filename)) return att;
  }
  return null;
}

function tsPrefix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Build a Markdown scope doc from the email when no attachment exists.
 * Front-matter encodes the source so the parser sees the email
 * subject as the project name hint.
 */
function buildScopeFromBody(email: IncomingEmail, targetPath: string): void {
  const subject = email.subject || 'Untitled brief';
  const body = email.bodyText || '(empty body)';
  const attachmentList = email.attachments.length
    ? email.attachments.map((a) => `- ${a.filename} (${a.mimeType}, ${a.sizeBytes} bytes) — ${a.path}`).join('\n')
    : '_(no attachments)_';

  const doc = `# ${subject}

**From:** ${email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
**Received:** ${email.receivedAt}
**Inbox:** ${email.inbox.address}

---

${body}

---

## Attachments

${attachmentList}
`;
  writeFileSync(targetPath, doc, 'utf8');
}

export async function runSoftwarePipeline(email: IncomingEmail): Promise<PipelineResult> {
  const inboxDir = ensureInboxDir();
  const scopeAttachment = pickScopeAttachment(email.attachments);

  // Stage the source doc inside ~/inbox so the existing intake watcher
  // also sees it (belt-and-braces) and so the archived path lands in a
  // predictable place.
  const stagedName = `${tsPrefix()}_${email.inbox.meta.type}_${email.uid}`;
  let stagedPath: string;

  if (scopeAttachment) {
    const ext = extname(scopeAttachment.filename) || '.md';
    stagedPath = join(inboxDir, `${stagedName}${ext}`);
    try {
      copyFileSync(scopeAttachment.path, stagedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: 'Could not stage scope attachment into intake inbox.',
        error: msg,
      };
    }
    logger.info(`Staged scope attachment ${scopeAttachment.filename} → ${stagedPath}`);
  } else {
    stagedPath = join(inboxDir, `${stagedName}.md`);
    try {
      buildScopeFromBody(email, stagedPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        summary: 'Could not materialise email body as scope doc.',
        error: msg,
      };
    }
    logger.info(`Built scope doc from email body → ${stagedPath}`);
  }

  try {
    const result = await ingestScopeFile(stagedPath, { skipEmail: true });
    const summary = `Scope ingested as project "${result.scope.projectName}" (${result.scope.serviceType}, ${result.scope.complexity}) — ${result.scope.tasks.length} tasks across ${result.scope.milestones.length} milestone(s).`;
    return {
      success: true,
      summary,
      projectId: result.projectId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Software pipeline failed: ${msg}`);
    return {
      success: false,
      summary: `Scope ingestion failed (${msg.slice(0, 120)}). Left the source at ${basename(stagedPath)} for manual review.`,
      error: msg,
    };
  }
}

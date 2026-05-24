/**
 * Legal matter intake pipeline.
 *
 * Triggered when an email lands in the LEGAL_EMAIL inbox. Steps:
 *   1. Allocate the next matter number (YYYY-NNNN).
 *   2. Extract a best-guess title, client name, client email, and
 *      matter type from the email subject + body using a small Haiku
 *      classifier call (cheap, fast).
 *   3. Persist a matter row with status='open'.
 *   4. Stage any attachments under the matter folder.
 *   5. Append a legal_audit_log entry.
 *   6. Notify the responsible lawyer (if INTAKE_LAWYER_EMAIL is set;
 *      otherwise notify ADMIN_EMAIL).
 *   7. Return a PipelineResult so the inbox-monitor router can send
 *      the standard auto-reply confirming "we have received your
 *      enquiry — your matter number is XXXX-NNNN".
 *
 * The Haiku call is best-effort. If it fails, we still create the
 * matter with a fallback title (the email subject), with matter_type
 * set to 'unclassified' so the responsible lawyer can correct it.
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createSafeLogger } from '../governance/index.js';
import { sendNotification } from '../email/notifier.js';
import { createMatter, nextMatterNumber, type Matter } from '../db/repositories/matters.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { redactForExternalModel } from '../compliance/privilege.js';
import { runConflictCheck, isMatterBlockedByConflict } from '../compliance/conflicts.js';
import { estimateMatterCost, saveMatterCostEstimate } from '../cost-estimator/index.js';
import { assertCanCreateMatter, LicenceLimitError } from '../licence/index.js';
import type { IncomingEmail, PipelineResult } from '../inbox-monitor/types.js';

const logger = createSafeLogger('LegalIntake');

export interface IntakeClassification {
  /** Short title for the matter (5–10 words). */
  title: string;
  /** Best guess of the prospective client's full name. */
  clientName: string;
  /** Best guess of the client's reply-to email (defaults to the sender). */
  clientEmail: string;
  /** Matter type bucket. */
  matterType:
    | 'contract'
    | 'employment'
    | 'estates'
    | 'family'
    | 'property'
    | 'commercial'
    | 'litigation'
    | 'criminal'
    | 'immigration'
    | 'regulatory'
    | 'unclassified';
  /** Default jurisdiction (Australian state code). */
  jurisdiction: string;
}

const FALLBACK_CLASSIFICATION = (email: IncomingEmail): IntakeClassification => ({
  title: email.subject || 'New matter intake',
  clientName: email.fromName || email.fromAddress,
  clientEmail: email.fromAddress,
  matterType: 'unclassified',
  jurisdiction: process.env.DEFAULT_JURISDICTION || 'NSW',
});

async function classifyIntake(email: IncomingEmail): Promise<IntakeClassification> {
  // Privilege-protected: redact before sending body to the model.
  const redacted = redactForExternalModel(email.bodyText.slice(0, 8000), {
    matterId: null,
  });

  const userPrompt = `You are an intake clerk for an Australian law firm.
Given a new inbound email, extract structured intake data as JSON.

Subject: ${email.subject}
From: ${email.fromName ?? '(no name)'} <${email.fromAddress}>

Body (privilege-redacted):
${redacted.text}

Respond ONLY with JSON of shape:
{
  "title": "5-10 word matter title",
  "clientName": "full name as it appears",
  "clientEmail": "reply-to address (default to sender)",
  "matterType": "contract|employment|estates|family|property|commercial|litigation|criminal|immigration|regulatory|unclassified",
  "jurisdiction": "NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Cth"
}`;

  let raw = '';
  try {
    for await (const msg of query({
      prompt: userPrompt,
      options: {
        model: 'claude-haiku-4-5',
        maxTurns: 1,
        maxBudgetUsd: 0.05,
      },
    })) {
      if (typeof msg === 'object' && msg !== null && 'type' in msg && (msg as { type?: string }).type === 'result') {
        raw = (msg as { result?: string }).result ?? raw;
      }
    }
  } catch (err) {
    logger.warn(`Intake classifier failed: ${err instanceof Error ? err.message : String(err)}; using fallback`);
    return FALLBACK_CLASSIFICATION(email);
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return FALLBACK_CLASSIFICATION(email);
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<IntakeClassification>;
    const fallback = FALLBACK_CLASSIFICATION(email);
    return {
      title: parsed.title || fallback.title,
      clientName: parsed.clientName || fallback.clientName,
      clientEmail: parsed.clientEmail || fallback.clientEmail,
      matterType: parsed.matterType || fallback.matterType,
      jurisdiction: parsed.jurisdiction || fallback.jurisdiction,
    };
  } catch (err) {
    logger.warn(`Intake classifier JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return FALLBACK_CLASSIFICATION(email);
  }
}

/**
 * Resolve the matter folder for a new matter. Defaults to
 * $MATTER_FOLDERS_ROOT/<matter_number>/ (under data/ in dev).
 */
function resolveMatterFolder(matterNumber: string): string {
  const root = process.env.MATTER_FOLDERS_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/matters' : './data/matters');
  const folder = join(root, matterNumber);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  return folder;
}

function stageAttachments(email: IncomingEmail, folder: string): string[] {
  const staged: string[] = [];
  if (!email.attachments.length) return staged;
  const inDir = join(folder, 'intake-attachments');
  if (!existsSync(inDir)) mkdirSync(inDir, { recursive: true });
  for (const att of email.attachments) {
    try {
      const dest = join(inDir, att.filename);
      copyFileSync(att.path, dest);
      staged.push(dest);
    } catch (err) {
      logger.warn(`Could not stage attachment ${att.filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return staged;
}

async function notifyResponsibleLawyer(matter: Matter, email: IncomingEmail): Promise<string | null> {
  const to = process.env.INTAKE_LAWYER_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) {
    logger.warn('No INTAKE_LAWYER_EMAIL or ADMIN_EMAIL set; skipping lawyer notification');
    return null;
  }

  const subject = `[${matter.matter_number}] New matter intake — ${matter.title}`;
  const html = `
    <h1>New matter intake</h1>
    <table style="border-collapse:collapse">
      <tr><td><b>Matter number</b></td><td>${escapeHtml(matter.matter_number)}</td></tr>
      <tr><td><b>Title</b></td><td>${escapeHtml(matter.title)}</td></tr>
      <tr><td><b>Client</b></td><td>${escapeHtml(matter.client_name)} ${matter.client_email ? `&lt;${escapeHtml(matter.client_email)}&gt;` : ''}</td></tr>
      <tr><td><b>Matter type</b></td><td>${escapeHtml(matter.matter_type)}</td></tr>
      <tr><td><b>Jurisdiction</b></td><td>${escapeHtml(matter.jurisdiction)}</td></tr>
      <tr><td><b>Inbox</b></td><td>${escapeHtml(email.inbox.address)}</td></tr>
      <tr><td><b>Attachments</b></td><td>${email.attachments.length}</td></tr>
      <tr><td><b>Folder</b></td><td><code>${escapeHtml(matter.matter_folder ?? '(none)')}</code></td></tr>
    </table>

    <h2>Original subject</h2>
    <p>${escapeHtml(email.subject)}</p>

    <h2>Original body (first 2000 chars)</h2>
    <pre>${escapeHtml(email.bodyText.slice(0, 2000))}</pre>

    <p style="color:#888"><i>Open in dashboard: /matter/${escapeHtml(matter.id)}</i></p>
  `;

  const id = await sendNotification(subject, html, to);
  return id ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function runLegalIntake(email: IncomingEmail): Promise<PipelineResult> {
  logger.info(`Intake from ${email.fromAddress}: "${email.subject.slice(0, 60)}"`);

  // 0. Licence gate — refuse new intake when the firm is over its
  //    plan or the licence has expired. Existing matters remain
  //    accessible; only NEW matter creation is blocked.
  try {
    assertCanCreateMatter();
  } catch (err) {
    if (err instanceof LicenceLimitError) {
      logger.warn(`Intake blocked by licence limit: ${err.message}`);
      return {
        success: false,
        summary: `Intake declined: ${err.message}`,
        error: err.message,
      };
    }
    throw err;
  }

  // 1 + 2. Allocate number + classify.
  const matterNumber = nextMatterNumber();
  const classification = await classifyIntake(email);

  // 3. Persist the matter.
  const folder = resolveMatterFolder(matterNumber);
  let matter: Matter;
  try {
    matter = createMatter({
      matter_number: matterNumber,
      title: classification.title,
      client_name: classification.clientName,
      client_email: classification.clientEmail,
      matter_type: classification.matterType,
      jurisdiction: classification.jurisdiction,
      responsible_lawyer_email: process.env.INTAKE_LAWYER_EMAIL || null,
      intake_email_id: email.messageId,
      matter_folder: folder,
      notes: `Intake from ${email.fromAddress} via ${email.inbox.address} on ${email.receivedAt}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Matter creation failed: ${msg}`);
    return {
      success: false,
      summary: `Matter creation failed: ${msg}`,
      error: msg,
    };
  }

  // 4. Stage attachments.
  const staged = stageAttachments(email, folder);

  // 4a. Conflict-of-interest check (hard rule — every new matter).
  //     Any match becomes a pending conflict that a lawyer must
  //     clear before the matter proceeds.
  let conflictStatus = 'cleared';
  let conflictCount = 0;
  try {
    const conflict = runConflictCheck({
      matterId: matter.id,
      newClientName: classification.clientName,
      newClientEmail: classification.clientEmail,
    });
    conflictStatus = conflict.status;
    conflictCount = conflict.match_count;
  } catch (err) {
    logger.warn(`conflict check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4b. Cost estimate (matter-type-driven baseline so the lawyer sees
  //     the expected AI spend on the dashboard).
  try {
    const est = estimateMatterCost(classification.matterType, 'medium');
    saveMatterCostEstimate({
      matterId: matter.id,
      matterType: classification.matterType,
      complexity: 'medium',
      estimatedAiUsd: est.estimatedAiUsd,
      estimatedLawyerHours: est.estimatedLawyerHours,
      notes: 'auto-estimated at intake',
    });
  } catch (err) {
    logger.warn(`cost estimate failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. Audit.
  appendLegalAudit({
    matterId: matter.id,
    actorId: 'system:legal-intake',
    action: 'matter.create',
    detail: `Created matter ${matter.matter_number} from inbox ${email.inbox.address}`,
    refTable: 'matters',
    refId: matter.id,
    metadata: {
      classification,
      intakeMessageId: email.messageId,
      stagedAttachments: staged.length,
      conflictStatus,
      conflictMatchCount: conflictCount,
    },
  });

  // 6. Notify the lawyer (best effort).
  const notifyId = await notifyResponsibleLawyer(matter, email);
  if (notifyId) {
    logger.info(`Lawyer notification sent (id=${notifyId})`);
  }

  // 7. Result for the inbox-monitor auto-reply.
  //     A pending conflict suppresses the auto-reply — we don't want
  //     to confirm receipt to someone we may be acting against.
  const blocked = isMatterBlockedByConflict(matter.id);
  if (blocked) {
    logger.warn(`Auto-reply suppressed for matter ${matter.matter_number}: pending conflict-of-interest check`);
  }
  return {
    success: true,
    matterId: matter.id,
    matterNumber: matter.matter_number,
    summary: blocked
      ? `Matter ${matter.matter_number} created. Auto-reply SUPPRESSED — pending conflict-of-interest check (${conflictCount} potential match(es)). A lawyer must clear the conflict before correspondence resumes.`
      : `Matter ${matter.matter_number} ("${matter.title}", ${matter.matter_type}, ${matter.jurisdiction}) created and the responsible lawyer has been notified.`,
  };
}

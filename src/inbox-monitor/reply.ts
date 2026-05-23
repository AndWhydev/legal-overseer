/**
 * Auto-reply sender.
 *
 * After a pipeline successfully routes an incoming email, we send a
 * short confirmation back to the original sender from the same inbox.
 *
 * The transporter is cached per (host, port, user) so repeated polls
 * don't reopen SMTP connections.
 *
 * Reply hygiene:
 *   - In-Reply-To and References headers point at the original
 *     Message-Id so the reply threads correctly in the sender's client.
 *   - Subject is prefixed with "Re: " unless it already starts with one.
 *   - We never reply to an email whose From: is the inbox itself (loop
 *     guard) or to an "no-reply" / "mailer-daemon" address.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { createSafeLogger } from '../governance/index.js';
import type { IncomingEmail, PipelineResult } from './types.js';

const logger = createSafeLogger('InboxMonitor.Reply');

const transporters = new Map<string, Transporter>();

function transporterFor(email: IncomingEmail): Transporter {
  const { inbox } = email;
  const key = `${inbox.smtp.host}|${inbox.smtp.port}|${inbox.address}`;
  const cached = transporters.get(key);
  if (cached) return cached;

  const t = nodemailer.createTransport({
    host: inbox.smtp.host,
    port: inbox.smtp.port,
    secure: inbox.smtp.secure,
    auth: { user: inbox.address, pass: inbox.password },
  });
  transporters.set(key, t);
  return t;
}

const NO_REPLY_PATTERNS = [
  /^no[._-]?reply@/i,
  /^do[._-]?not[._-]?reply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounces?@/i,
];

function shouldSkipReply(email: IncomingEmail): string | null {
  if (email.fromAddress === email.inbox.address.toLowerCase()) {
    return 'sender == inbox (loop guard)';
  }
  for (const re of NO_REPLY_PATTERNS) {
    if (re.test(email.fromAddress)) return `no-reply sender (${email.fromAddress})`;
  }
  return null;
}

function buildReply(email: IncomingEmail, result: PipelineResult): { subject: string; text: string; html: string } {
  const subjectBase = email.subject || '(no subject)';
  const subject = /^re:\s*/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`;

  const inboxLabel = email.inbox.meta.label;
  const taskLine = result.taskId
    ? `Internal reference: ${result.taskId}`
    : result.projectId
      ? `Internal reference: project ${result.projectId}`
      : 'Internal reference: pending';

  const attachmentNote = email.attachments.length
    ? `We received ${email.attachments.length} attachment(s) and they have been filed with the brief.`
    : 'No attachments were attached to your email.';

  const text = [
    `Hi${email.fromName ? ` ${email.fromName.split(' ')[0]}` : ''},`,
    '',
    `Thanks — your ${inboxLabel.toLowerCase()} brief has landed and we've started work on it.`,
    '',
    `Brief summary: ${result.summary}`,
    attachmentNote,
    '',
    'We will follow up directly with progress updates and any clarifying questions.',
    '',
    taskLine,
    '',
    '— Automated confirmation; replies to this thread will reach the team.',
  ].join('\n');

  const html = [
    `<p>Hi${email.fromName ? ` ${escapeHtml(email.fromName.split(' ')[0])}` : ''},</p>`,
    `<p>Thanks — your <b>${escapeHtml(inboxLabel.toLowerCase())}</b> brief has landed and we've started work on it.</p>`,
    `<p><b>Brief summary:</b> ${escapeHtml(result.summary)}</p>`,
    `<p>${escapeHtml(attachmentNote)}</p>`,
    `<p>We will follow up directly with progress updates and any clarifying questions.</p>`,
    `<p style="color:#666"><i>${escapeHtml(taskLine)}</i></p>`,
    `<p style="color:#888;font-size:12px"><i>Automated confirmation; replies to this thread will reach the team.</i></p>`,
  ].join('\n');

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send the auto-confirmation reply. Returns true when sent, false when
 * skipped or when SMTP errored. Errors are logged and swallowed — a
 * reply failure must never abort the pipeline.
 */
export async function sendAutoReply(
  email: IncomingEmail,
  result: PipelineResult,
): Promise<boolean> {
  const skip = shouldSkipReply(email);
  if (skip) {
    logger.info(`Skipping auto-reply for ${email.inbox.meta.type} uid=${email.uid}: ${skip}`);
    return false;
  }

  const { subject, text, html } = buildReply(email, result);

  try {
    const info = await transporterFor(email).sendMail({
      from: `"${email.inbox.meta.label}" <${email.inbox.address}>`,
      to: email.fromAddress,
      subject,
      text,
      html,
      inReplyTo: email.messageId,
      references: email.messageId,
    });
    logger.info(
      `Auto-reply sent for ${email.inbox.meta.type} uid=${email.uid} to ${email.fromAddress} (id=${info.messageId})`,
    );
    return true;
  } catch (err) {
    logger.error(
      `Auto-reply failed for ${email.inbox.meta.type} uid=${email.uid}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

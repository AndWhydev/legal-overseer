/**
 * Email notifier for the BitBit overseer.
 *
 * Replaces the previous Telegram-based notification surface. Every
 * outbound channel (escalations, system alerts, briefings, approval
 * requests) now goes to the operator via email.
 *
 * Configuration (all from environment):
 *   ADMIN_EMAIL  — destination address for all notifications
 *   SMTP_HOST    — SMTP server hostname
 *   SMTP_PORT    — SMTP server port (default 587)
 *   SMTP_USER    — SMTP auth username
 *   SMTP_PASS    — SMTP auth password
 *   SMTP_FROM    — optional From: address (defaults to SMTP_USER)
 *   SMTP_SECURE  — "true" to force TLS (default: only when port=465)
 *
 * When SMTP is not configured, all send functions log a warning and
 * return a failure result without throwing — the rest of the system
 * keeps working in dev environments without email credentials.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { createSafeLogger } from '../governance/logger.js';
import type { Project } from '../db/repositories/projects.js';
import {
  createApprovalRequest,
  type CreateApprovalResult,
} from '../db/repositories/approvals.js';

const logger = createSafeLogger('EmailNotifier');

/**
 * Escape HTML special characters for safe inclusion in email HTML bodies.
 * Preserves the same name the rest of the codebase used to import from
 * the telegram module so call sites don't need rewording.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lazy-initialized transporter so we only build it once per process
 * and only when SMTP credentials are actually present.
 */
let cachedTransporter: Transporter | null = null;
let cachedTransporterFingerprint: string | null = null;

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
  to: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.ADMIN_EMAIL;
  if (!host || !user || !pass || !to) return null;

  const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
  if (!Number.isFinite(port) || port <= 0) {
    logger.warn(`Invalid SMTP_PORT "${process.env.SMTP_PORT}"; falling back to 587`);
  }
  const finalPort = Number.isFinite(port) && port > 0 ? port : 587;

  // Default to TLS on the implicit-TLS port (465); otherwise use STARTTLS
  // unless the operator explicitly forces it.
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv ? secureEnv === 'true' : finalPort === 465;

  return {
    host,
    port: finalPort,
    user,
    pass,
    from: process.env.SMTP_FROM ?? user,
    secure,
    to,
  };
}

function getTransporter(config: SmtpConfig): Transporter {
  const fingerprint = `${config.host}|${config.port}|${config.secure}|${config.user}`;
  if (cachedTransporter && cachedTransporterFingerprint === fingerprint) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  cachedTransporterFingerprint = fingerprint;
  return cachedTransporter;
}

/**
 * Result returned by every email-sending function. Mirrors the shape of
 * the old Telegram NotificationResult so call sites that destructure
 * `{ success, error }` keep working unchanged.
 */
export interface NotificationResult {
  success: boolean;
  /** Provider message id when known */
  messageId?: string;
  error?: string;
}

interface SendArgs {
  subject: string;
  html: string;
  /** Optional plain-text alternative; auto-derived from HTML when omitted */
  text?: string;
  /** Optional recipient override. Defaults to ADMIN_EMAIL when omitted. */
  to?: string;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Send one email. All higher-level functions in this module funnel
 * through here. Returns a NotificationResult instead of throwing so the
 * caller can decide whether a notification failure is fatal.
 */
async function sendEmail(args: SendArgs): Promise<NotificationResult> {
  const config = readSmtpConfig();
  if (!config) {
    logger.warn(
      'Email notifier: SMTP not configured (need ADMIN_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS)',
    );
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const transporter = getTransporter(config);
    const info = await transporter.sendMail({
      from: config.from,
      to: args.to ?? config.to,
      subject: args.subject,
      html: args.html,
      text: args.text ?? htmlToText(args.html),
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Email send failed: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * True when SMTP is configured well enough to send email. Useful for
 * gating optional notification paths (e.g. skip dispatch when we know
 * the operator wouldn't be reachable anyway).
 */
export function isEmailConfigured(): boolean {
  return readSmtpConfig() !== null;
}

// ─────────────────────────────────────────────────────────────────────
// Generic notification (replaces telegram.sendNotification)
// ─────────────────────────────────────────────────────────────────────

/**
 * Send a generic notification email. Returns the messageId on success.
 *
 * Recipient defaults to ADMIN_EMAIL; pass `to` to override (used by the
 * scope-intake confirmation that always goes to the operator's primary
 * address regardless of ADMIN_EMAIL).
 */
export async function sendNotification(
  subject: string,
  htmlBody: string,
  to?: string,
): Promise<string | undefined> {
  const result = await sendEmail({ subject, html: htmlBody, to });
  return result.messageId;
}

// ─────────────────────────────────────────────────────────────────────
// System alerts (replaces telegram.sendSystemAlert)
// ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'warning' | 'critical' | 'error';

export interface SystemAlertData {
  severity: AlertSeverity;
  title: string;
  message: string;
  component?: string;
  action?: string;
}

const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  critical: '[CRITICAL]',
  error: '[ERROR]',
  warning: '[WARNING]',
};

export async function sendSystemAlert(
  alert: SystemAlertData,
): Promise<NotificationResult> {
  const subject = `${SEVERITY_PREFIX[alert.severity]} ${alert.title}`;
  const parts: string[] = [
    `<h2>${escapeHtml(alert.title)}</h2>`,
    `<p><b>Severity:</b> ${escapeHtml(alert.severity)}</p>`,
    `<p>${escapeHtml(alert.message)}</p>`,
  ];
  if (alert.component) {
    parts.push(`<p><b>Component:</b> ${escapeHtml(alert.component)}</p>`);
  }
  if (alert.action) {
    parts.push(`<p><b>Action:</b> ${escapeHtml(alert.action)}</p>`);
  }
  parts.push(`<p style="color:#888"><i>${escapeHtml(new Date().toISOString())}</i></p>`);

  const result = await sendEmail({ subject, html: parts.join('\n') });
  if (result.success) {
    logger.info(`System alert sent: ${alert.severity} - ${alert.title}`);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Approval requests (replaces telegram.sendApprovalRequest)
// ─────────────────────────────────────────────────────────────────────

export interface SendApprovalParams {
  taskId: string;
  actionType: string;
  actionSummary: string;
  amount?: number;
  currency?: string;
  /**
   * Optional pre-rendered HTML body. When omitted, a compact default is
   * built from actionSummary + amount.
   */
  htmlBody?: string;
}

export interface SendApprovalResult {
  success: boolean;
  approvalId?: string;
  /** Approval token the operator quotes back to approve/reject */
  approvalToken?: string;
  messageId?: string;
  error?: string;
}

function formatAmount(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$', AUD: 'A$', EUR: '€', GBP: '£', CNY: '¥',
  };
  const symbol = symbols[currency.toUpperCase()] ?? `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Send an approval-required email and persist the approval record.
 *
 * Without an interactive callback channel (Telegram inline buttons),
 * the operator approves/rejects via the dashboard or CLI by quoting
 * the approval token included in the email body.
 */
export async function sendApprovalRequest(
  params: SendApprovalParams,
): Promise<SendApprovalResult> {
  // Create the approval row first so the email body can reference its token.
  let approval: CreateApprovalResult;
  try {
    approval = createApprovalRequest({
      taskId: params.taskId,
      actionType: params.actionType,
      actionSummary: params.actionSummary,
      amount: params.amount,
      currency: params.currency,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to create approval request: ${msg}`);
    return { success: false, error: msg };
  }

  const subject = `[Approval Required] ${params.actionType}`;
  const body = params.htmlBody ?? buildDefaultApprovalBody(params);
  const tokenBlock = `
    <hr/>
    <p><b>Approval token:</b> <code>${escapeHtml(approval.token)}</code></p>
    <p><i>Approve or reject this request via the overseer dashboard or CLI using the token above. Request expires in 24 hours.</i></p>`;

  const result = await sendEmail({ subject, html: body + tokenBlock });
  if (!result.success) {
    return {
      success: false,
      approvalId: approval.id,
      approvalToken: approval.token,
      error: result.error,
    };
  }
  logger.info(`Approval request ${approval.id} emailed for task ${params.taskId}`);
  return {
    success: true,
    approvalId: approval.id,
    approvalToken: approval.token,
    messageId: result.messageId,
  };
}

function buildDefaultApprovalBody(params: SendApprovalParams): string {
  const parts: string[] = [
    `<h2>Approval Required</h2>`,
    `<p><b>Task:</b> <code>${escapeHtml(params.taskId)}</code></p>`,
    `<p><b>Action:</b> ${escapeHtml(params.actionType)}</p>`,
    `<p>${escapeHtml(params.actionSummary)}</p>`,
  ];
  if (params.amount !== undefined && params.currency) {
    parts.push(
      `<p><b>Amount:</b> ${escapeHtml(formatAmount(params.amount, params.currency))}</p>`,
    );
  }
  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Overseer escalation (replaces telegram.sendEscalation)
// ─────────────────────────────────────────────────────────────────────

/**
 * Send the overseer's "I need a human decision" email for a project.
 *
 * Includes project metadata, the reason Opus produced, and a pointer to
 * the dashboard URL when DASHBOARD_URL is configured.
 *
 * Returns true on success, false otherwise. The overseer loop treats
 * email-send failures as non-fatal — the decision is still persisted to
 * the database regardless.
 */
export async function sendEscalation(
  project: Project,
  reason: string,
): Promise<boolean> {
  const subject = `[Overseer] Decision needed — ${project.name}`;
  const dashboardUrl = process.env.DASHBOARD_URL;
  const dashboardLink = dashboardUrl
    ? `<p><a href="${escapeHtml(dashboardUrl)}/project/${escapeHtml(project.id)}">Open project in dashboard</a></p>`
    : '';

  const html = `
    <h2>Overseer escalation</h2>
    <p><b>Project:</b> ${escapeHtml(project.name)}</p>
    <p><b>Path:</b> <code>${escapeHtml(project.path)}</code></p>
    <p><b>Priority:</b> ${project.priority} &middot; <b>Tier:</b> ${escapeHtml(project.model_tier_override ?? 'default')}</p>
    <hr/>
    <p><b>Reason:</b></p>
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(reason).slice(0, 4000)}</pre>
    ${dashboardLink}
  `;

  const result = await sendEmail({ subject, html });
  if (result.success) {
    logger.info(`Escalation emailed for project ${project.name}`);
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Briefings (replaces telegram delivery in briefing/scheduler)
// ─────────────────────────────────────────────────────────────────────

/**
 * Send a daily briefing as an email. Caller supplies the pre-formatted
 * HTML body so the briefing module retains full control of layout.
 */
export async function sendBriefingEmail(
  subject: string,
  htmlBody: string,
): Promise<NotificationResult> {
  return sendEmail({ subject, html: htmlBody });
}

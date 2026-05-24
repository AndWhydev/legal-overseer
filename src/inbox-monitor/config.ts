/**
 * Inbox configuration loader — Legal Overseer.
 *
 * Reads the four legal inbox slots from environment variables. Naming
 * pattern is strict and documented in .env.example:
 *
 *   <SLUG>_EMAIL          inbox address (required)
 *   <SLUG>_EMAIL_PASS     password / app password (required)
 *   <SLUG>_EMAIL_IMAP_HOST   optional, default derived from address
 *   <SLUG>_EMAIL_IMAP_PORT   optional, default 993 (IMAPS)
 *   <SLUG>_EMAIL_SMTP_HOST   optional, default derived from address
 *   <SLUG>_EMAIL_SMTP_PORT   optional, default 587 (STARTTLS)
 *
 * Slugs: LEGAL, CLIENT, COURT, INTERNAL.
 *
 * The intake inbox (LEGAL_EMAIL) is the matter intake address — every
 * new-matter enquiry the firm publishes (website contact form, "new
 * matter" email on the letterhead) lands here.
 *
 * If either the address or password is missing for a slot, the slot
 * is disabled — the poller logs that and moves on.
 */

import { createSafeLogger } from '../governance/index.js';
import type { InboxSlotMeta, ResolvedInboxConfig } from './types.js';

const logger = createSafeLogger('InboxMonitor.Config');

export const INBOX_SLOTS: InboxSlotMeta[] = [
  {
    type: 'legal_intake',
    label: 'New Matter Intake',
    pipelineKey: 'legal_intake',
    envAddress: 'LEGAL_EMAIL',
    envPassword: 'LEGAL_EMAIL_PASS',
    envImapHost: 'LEGAL_EMAIL_IMAP_HOST',
    envImapPort: 'LEGAL_EMAIL_IMAP_PORT',
    envSmtpHost: 'LEGAL_EMAIL_SMTP_HOST',
    envSmtpPort: 'LEGAL_EMAIL_SMTP_PORT',
  },
  {
    type: 'client',
    label: 'Client Correspondence',
    pipelineKey: 'client',
    envAddress: 'CLIENT_EMAIL',
    envPassword: 'CLIENT_EMAIL_PASS',
    envImapHost: 'CLIENT_EMAIL_IMAP_HOST',
    envImapPort: 'CLIENT_EMAIL_IMAP_PORT',
    envSmtpHost: 'CLIENT_EMAIL_SMTP_HOST',
    envSmtpPort: 'CLIENT_EMAIL_SMTP_PORT',
  },
  {
    type: 'court',
    label: 'Court / Regulator',
    pipelineKey: 'court',
    envAddress: 'COURT_EMAIL',
    envPassword: 'COURT_EMAIL_PASS',
    envImapHost: 'COURT_EMAIL_IMAP_HOST',
    envImapPort: 'COURT_EMAIL_IMAP_PORT',
    envSmtpHost: 'COURT_EMAIL_SMTP_HOST',
    envSmtpPort: 'COURT_EMAIL_SMTP_PORT',
  },
  {
    type: 'internal',
    label: 'Internal Operations',
    pipelineKey: 'internal',
    envAddress: 'INTERNAL_EMAIL',
    envPassword: 'INTERNAL_EMAIL_PASS',
    envImapHost: 'INTERNAL_EMAIL_IMAP_HOST',
    envImapPort: 'INTERNAL_EMAIL_IMAP_PORT',
    envSmtpHost: 'INTERNAL_EMAIL_SMTP_HOST',
    envSmtpPort: 'INTERNAL_EMAIL_SMTP_PORT',
  },
];

const PROVIDER_DEFAULTS: Record<string, { imap: string; smtp: string }> = {
  'gmail.com':       { imap: 'imap.gmail.com',         smtp: 'smtp.gmail.com' },
  'googlemail.com':  { imap: 'imap.gmail.com',         smtp: 'smtp.gmail.com' },
  'outlook.com':     { imap: 'outlook.office365.com',  smtp: 'smtp.office365.com' },
  'hotmail.com':     { imap: 'outlook.office365.com',  smtp: 'smtp.office365.com' },
  'office365.com':   { imap: 'outlook.office365.com',  smtp: 'smtp.office365.com' },
  'icloud.com':      { imap: 'imap.mail.me.com',       smtp: 'smtp.mail.me.com' },
  'yahoo.com':       { imap: 'imap.mail.yahoo.com',    smtp: 'smtp.mail.yahoo.com' },
  'fastmail.com':    { imap: 'imap.fastmail.com',      smtp: 'smtp.fastmail.com' },
  'zoho.com':        { imap: 'imap.zoho.com',          smtp: 'smtp.zoho.com' },
  'protonmail.com':  { imap: '127.0.0.1',              smtp: '127.0.0.1' },
};

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).toLowerCase() : '';
}

export function resolveInboxConfig(slot: InboxSlotMeta): ResolvedInboxConfig | null {
  const address = process.env[slot.envAddress];
  const password = process.env[slot.envPassword];
  if (!address || !password) return null;

  const domain = domainOf(address);
  const defaults = PROVIDER_DEFAULTS[domain];

  const imapHost = process.env[slot.envImapHost] || defaults?.imap;
  const smtpHost = process.env[slot.envSmtpHost] || defaults?.smtp;

  if (!imapHost) {
    logger.warn(
      `Inbox ${slot.type} (${address}): unknown provider domain "${domain}"; set ${slot.envImapHost} to enable.`,
    );
    return null;
  }
  if (!smtpHost) {
    logger.warn(
      `Inbox ${slot.type} (${address}): unknown provider domain "${domain}"; set ${slot.envSmtpHost} to enable auto-reply.`,
    );
    return null;
  }

  const imapPort = parsePort(process.env[slot.envImapPort], 993);
  const smtpPort = parsePort(process.env[slot.envSmtpPort], 587);

  return {
    meta: slot,
    address,
    password,
    imap: { host: imapHost, port: imapPort, secure: imapPort === 993 },
    smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465 },
  };
}

export function resolveAllInboxes(): ResolvedInboxConfig[] {
  return INBOX_SLOTS
    .map((slot) => resolveInboxConfig(slot))
    .filter((c): c is ResolvedInboxConfig => c !== null);
}

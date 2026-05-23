/**
 * Inbox configuration loader.
 *
 * Reads the five inbox slots from environment variables. The naming
 * pattern is strict and documented in .env.example:
 *
 *   <SLUG>_EMAIL          inbox address (required)
 *   <SLUG>_EMAIL_PASS     password / app password (required)
 *   <SLUG>_EMAIL_IMAP_HOST   optional, default derived from address
 *   <SLUG>_EMAIL_IMAP_PORT   optional, default 993 (IMAPS)
 *   <SLUG>_EMAIL_SMTP_HOST   optional, default derived from address
 *   <SLUG>_EMAIL_SMTP_PORT   optional, default 587 (STARTTLS)
 *
 * Slugs: SOFTWARE, SEO, DESIGN, CONTENT, OPS.
 *
 * If either the address or password is missing for a slot, the slot is
 * disabled — the poller logs that and moves on. This lets operators
 * roll out one inbox at a time.
 */

import { createSafeLogger } from '../governance/index.js';
import type { InboxSlotMeta, ResolvedInboxConfig } from './types.js';

const logger = createSafeLogger('InboxMonitor.Config');

/**
 * Fixed catalogue of the five inbox slots. Append-only — the
 * processed_emails table's CHECK constraint is keyed off these.
 */
export const INBOX_SLOTS: InboxSlotMeta[] = [
  {
    type: 'software',
    label: 'Software Engineering',
    pipelineKey: 'software',
    envAddress: 'SOFTWARE_EMAIL',
    envPassword: 'SOFTWARE_EMAIL_PASS',
    envImapHost: 'SOFTWARE_EMAIL_IMAP_HOST',
    envImapPort: 'SOFTWARE_EMAIL_IMAP_PORT',
    envSmtpHost: 'SOFTWARE_EMAIL_SMTP_HOST',
    envSmtpPort: 'SOFTWARE_EMAIL_SMTP_PORT',
  },
  {
    type: 'seo',
    label: 'SEO / Backlinks',
    pipelineKey: 'seo_backlinks',
    envAddress: 'SEO_EMAIL',
    envPassword: 'SEO_EMAIL_PASS',
    envImapHost: 'SEO_EMAIL_IMAP_HOST',
    envImapPort: 'SEO_EMAIL_IMAP_PORT',
    envSmtpHost: 'SEO_EMAIL_SMTP_HOST',
    envSmtpPort: 'SEO_EMAIL_SMTP_PORT',
  },
  {
    type: 'design',
    label: 'Design',
    pipelineKey: 'design',
    envAddress: 'DESIGN_EMAIL',
    envPassword: 'DESIGN_EMAIL_PASS',
    envImapHost: 'DESIGN_EMAIL_IMAP_HOST',
    envImapPort: 'DESIGN_EMAIL_IMAP_PORT',
    envSmtpHost: 'DESIGN_EMAIL_SMTP_HOST',
    envSmtpPort: 'DESIGN_EMAIL_SMTP_PORT',
  },
  {
    type: 'content',
    label: 'Content Writing',
    pipelineKey: 'content',
    envAddress: 'CONTENT_EMAIL',
    envPassword: 'CONTENT_EMAIL_PASS',
    envImapHost: 'CONTENT_EMAIL_IMAP_HOST',
    envImapPort: 'CONTENT_EMAIL_IMAP_PORT',
    envSmtpHost: 'CONTENT_EMAIL_SMTP_HOST',
    envSmtpPort: 'CONTENT_EMAIL_SMTP_PORT',
  },
  {
    type: 'ops',
    label: 'Internal Operations',
    pipelineKey: 'ops',
    envAddress: 'OPS_EMAIL',
    envPassword: 'OPS_EMAIL_PASS',
    envImapHost: 'OPS_EMAIL_IMAP_HOST',
    envImapPort: 'OPS_EMAIL_IMAP_PORT',
    envSmtpHost: 'OPS_EMAIL_SMTP_HOST',
    envSmtpPort: 'OPS_EMAIL_SMTP_PORT',
  },
];

/**
 * Known IMAP/SMTP defaults keyed by the email domain. Covers the
 * providers most operators actually use. Anything outside this list
 * must set the host env var explicitly — better than silently
 * connecting to the wrong server.
 */
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
  'protonmail.com':  { imap: '127.0.0.1',              smtp: '127.0.0.1' }, // requires Bridge
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

/**
 * Try to resolve one slot from env. Returns null when the slot isn't
 * configured (so the poller can skip it cleanly) or when an explicit
 * host is missing for an unknown provider domain.
 */
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

/**
 * Resolve every slot. Disabled slots are filtered out — the caller
 * just iterates over what comes back.
 */
export function resolveAllInboxes(): ResolvedInboxConfig[] {
  return INBOX_SLOTS
    .map((slot) => resolveInboxConfig(slot))
    .filter((c): c is ResolvedInboxConfig => c !== null);
}

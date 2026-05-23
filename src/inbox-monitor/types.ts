/**
 * Inbox monitor type definitions.
 *
 * Five dedicated inboxes — each one routes to a different downstream
 * pipeline. The inbox type drives which pipeline gets the email, which
 * env var pair we read for IMAP/SMTP, and how the auto-reply is worded.
 */

import type { InboxType } from '../db/repositories/processedEmails.js';

export type { InboxType };

/**
 * Static descriptor for one inbox slot. The five slots are fixed —
 * the operator can leave any of them unconfigured (no env vars) and
 * the poller silently skips it.
 */
export interface InboxSlotMeta {
  type: InboxType;
  /** Human label for logs + the auto-reply. */
  label: string;
  /** The pipeline keyword that surfaces in tasks.input_json.pipeline_type. */
  pipelineKey: string;
  /** Env var holding the address. */
  envAddress: string;
  /** Env var holding the password / app password. */
  envPassword: string;
  /** Env var holding the IMAP host override (optional). */
  envImapHost: string;
  /** Env var holding the IMAP port override (optional). */
  envImapPort: string;
  /** Env var holding the SMTP host override (optional). */
  envSmtpHost: string;
  /** Env var holding the SMTP port override (optional). */
  envSmtpPort: string;
}

/**
 * Fully-resolved runtime config for one inbox after reading env vars.
 * Built only when both address + password are set.
 */
export interface ResolvedInboxConfig {
  meta: InboxSlotMeta;
  address: string;
  password: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
}

/**
 * Normalised attachment after MIME parsing + disk save.
 */
export interface SavedAttachment {
  filename: string;
  /** Local path under data/inbox-monitor/<inbox>/<uid>/. */
  path: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Normalised email after fetch + parse. This is what every pipeline
 * handler accepts — they never touch IMAP or MIME directly.
 */
export interface IncomingEmail {
  /** The inbox slot that received this message. */
  inbox: ResolvedInboxConfig;
  /** IMAP UID of the message. Unique per inbox + UIDVALIDITY. */
  uid: number;
  /** Globally-unique Message-Id header. */
  messageId: string;
  /** Address-only form of the sender (lowercased). */
  fromAddress: string;
  /** Display name from the From header, if any. */
  fromName: string | null;
  /** All To addresses on the message. */
  to: string[];
  subject: string;
  /** Best plain-text body — falls back to stripped HTML when text is missing. */
  bodyText: string;
  /** Raw HTML body when present (used by some pipelines for quoting). */
  bodyHtml: string | null;
  /** ISO-8601 received timestamp from the Date header. */
  receivedAt: string;
  /** Attachments already written to disk. */
  attachments: SavedAttachment[];
  /** Directory containing the saved attachments (null when there are none). */
  attachmentsDir: string | null;
}

/**
 * Outcome of running one pipeline handler. The router persists this to
 * processed_emails so we can audit per-pipeline routing decisions.
 */
export interface PipelineResult {
  success: boolean;
  /** Task row inserted (when applicable). */
  taskId?: string;
  /** Project row inserted (when the pipeline scaffolded one). */
  projectId?: string;
  /** Free-text summary for logs + auto-reply. */
  summary: string;
  /** Set when success=false. */
  error?: string;
}

/**
 * Function signature every pipeline handler implements.
 */
export type PipelineHandler = (email: IncomingEmail) => Promise<PipelineResult>;

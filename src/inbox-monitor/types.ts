/**
 * Inbox monitor type definitions — Legal Overseer.
 *
 * Four dedicated inboxes — each routes to a different downstream
 * pipeline. The inbox type drives which pipeline gets the email,
 * which env var pair we read for IMAP/SMTP, and how the auto-reply
 * is worded.
 *
 *   legal_intake  → src/legal-intake (matter creation, intake reply)
 *   client        → ongoing matter correspondence on existing matters
 *   court         → court / tribunal / regulator correspondence
 *   internal      → internal firm operations (admin, billing, IT)
 */

import type { InboxType } from '../db/repositories/processedEmails.js';

export type { InboxType };

export interface InboxSlotMeta {
  type: InboxType;
  /** Human label for logs + the auto-reply. */
  label: string;
  /** Pipeline keyword that surfaces in tasks.input_json.pipeline_type. */
  pipelineKey: string;
  envAddress: string;
  envPassword: string;
  envImapHost: string;
  envImapPort: string;
  envSmtpHost: string;
  envSmtpPort: string;
}

export interface ResolvedInboxConfig {
  meta: InboxSlotMeta;
  address: string;
  password: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
}

export interface SavedAttachment {
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IncomingEmail {
  inbox: ResolvedInboxConfig;
  uid: number;
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
  attachments: SavedAttachment[];
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
  /** Matter row inserted or matched (when the pipeline created/linked one). */
  matterId?: string;
  /** Human-readable matter number for the auto-reply. */
  matterNumber?: string;
  /** Free-text summary for logs + auto-reply. */
  summary: string;
  /** Set when success=false. */
  error?: string;
}

export type PipelineHandler = (email: IncomingEmail) => Promise<PipelineResult>;

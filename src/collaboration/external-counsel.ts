/**
 * 5.2 — External counsel portal.
 *
 * Generates a token-protected brief for external counsel (barristers,
 * specialists). Shares only the selected documents. Counsel can view
 * documents, upload their work product, and message the instructing
 * lawyer. All access is logged.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getMatterById } from '../db/repositories/matters.js';
import { getDocument } from '../uploads/store.js';

const logger = createSafeLogger('ExternalCounsel');

export interface ExternalBrief {
  id: string;
  matter_id: string;
  counsel_name: string;
  counsel_email: string;
  chambers: string | null;
  instructing_lawyer_email: string;
  access_token: string;
  instructions_markdown: string;
  shared_document_ids: string | null;
  download_allowed: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ExternalAccessLogEntry {
  id: string;
  brief_id: string;
  action: string;
  document_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  accessed_at: string;
}

export interface ExternalUpload {
  id: string;
  brief_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  stored_path: string;
  uploaded_at: string;
}

function externalUploadsRoot(): string {
  return process.env.EXTERNAL_UPLOADS_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/external-counsel' : './data/external-counsel');
}

export interface CreateBriefInput {
  matterId: string;
  counselName: string;
  counselEmail: string;
  chambers?: string;
  instructingLawyerEmail: string;
  instructionsMarkdown: string;
  sharedDocumentIds: string[];
  downloadAllowed?: boolean;
  expiresInDays?: number;
}

export function createExternalBrief(input: CreateBriefInput): ExternalBrief {
  const matter = getMatterById(input.matterId);
  if (!matter) throw new Error(`matter ${input.matterId} not found`);
  const db = getDatabase();
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + (input.expiresInDays ?? 90) * 86400000).toISOString();
  db.prepare(
    `INSERT INTO external_counsel_briefs
       (id, matter_id, counsel_name, counsel_email, chambers,
        instructing_lawyer_email, access_token, instructions_markdown,
        shared_document_ids, download_allowed, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    matter.id,
    input.counselName,
    input.counselEmail,
    input.chambers ?? null,
    input.instructingLawyerEmail,
    token,
    input.instructionsMarkdown,
    JSON.stringify(input.sharedDocumentIds),
    input.downloadAllowed ? 1 : 0,
    expires,
  );
  appendLegalAudit({
    matterId: matter.id,
    actorId: input.instructingLawyerEmail,
    action: 'external_counsel.brief_created',
    detail: `${input.counselName} <${input.counselEmail}> — ${input.sharedDocumentIds.length} doc(s)`,
    refTable: 'external_counsel_briefs',
    refId: id,
  });
  return getBrief(id) as ExternalBrief;
}

export function getBrief(id: string): ExternalBrief | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM external_counsel_briefs WHERE id = ?').get(id) as
      | ExternalBrief
      | undefined) ?? null
  );
}

export function getBriefByToken(token: string): ExternalBrief | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM external_counsel_briefs WHERE access_token = ?')
    .get(token) as ExternalBrief | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at < new Date().toISOString()) return null;
  return row;
}

export function revokeBrief(id: string, acting: string): void {
  const db = getDatabase();
  db.prepare(`UPDATE external_counsel_briefs SET revoked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id,
  );
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'external_counsel.revoked',
    detail: id,
    refTable: 'external_counsel_briefs',
    refId: id,
  });
}

export function logAccess(
  briefId: string,
  action: string,
  documentId?: string | null,
  ip?: string,
  userAgent?: string,
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO external_counsel_access_log
       (id, brief_id, action, document_id, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    briefId,
    action,
    documentId ?? null,
    ip ?? null,
    userAgent ?? null,
  );
}

export function listAccessLog(briefId: string): ExternalAccessLogEntry[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM external_counsel_access_log WHERE brief_id = ? ORDER BY accessed_at DESC`,
    )
    .all(briefId) as ExternalAccessLogEntry[];
}

export interface UploadFromCounselInput {
  briefId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export function uploadFromCounsel(input: UploadFromCounselInput): ExternalUpload {
  const brief = getBrief(input.briefId);
  if (!brief) throw new Error('brief not found');
  const dir = join(externalUploadsRoot(), brief.id);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const path = join(dir, `${id}-${safe}`);
  writeFileSync(path, input.data, { mode: 0o600 });
  const db = getDatabase();
  db.prepare(
    `INSERT INTO external_counsel_uploads
       (id, brief_id, filename, content_type, size_bytes, stored_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, brief.id, input.filename, input.contentType, input.data.length, path);
  logAccess(brief.id, 'upload', null, undefined, undefined);
  appendLegalAudit({
    matterId: brief.matter_id,
    actorId: brief.counsel_email,
    action: 'external_counsel.upload',
    detail: `${input.filename} (${input.data.length} bytes)`,
    refTable: 'external_counsel_uploads',
    refId: id,
  });
  return db.prepare('SELECT * FROM external_counsel_uploads WHERE id = ?').get(id) as ExternalUpload;
}

export function listCounselUploads(briefId: string): ExternalUpload[] {
  const db = getDatabase();
  return db
    .prepare(`SELECT * FROM external_counsel_uploads WHERE brief_id = ? ORDER BY uploaded_at DESC`)
    .all(briefId) as ExternalUpload[];
}

export function canCounselSeeDocument(briefId: string, documentId: string): boolean {
  const brief = getBrief(briefId);
  if (!brief) return false;
  if (!brief.shared_document_ids) return false;
  try {
    const ids = JSON.parse(brief.shared_document_ids) as string[];
    if (!ids.includes(documentId)) return false;
    return !!getDocument(brief.matter_id, documentId);
  } catch {
    return false;
  }
}

/**
 * 2.1 — Full document version control.
 *
 * Every modification to a stored document is captured in
 * document_versions. The current version always sits at the path the
 * uploads store wrote; previous versions are copied into a
 * versions/<timestamp>/ subdirectory next to the document. Rollback
 * promotes a previous version into the current slot and logs the
 * action in the audit trail.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getDocument, matterDocDir, type StoredDocument } from '../uploads/store.js';

const logger = createSafeLogger('DocVersionControl');

export interface DocumentVersion {
  id: string;
  document_id: string;
  matter_id: string;
  version_number: number;
  stored_path: string;
  size_bytes: number;
  content_hash: string;
  change_summary: string | null;
  modified_by: string;
  created_at: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function versionsDir(matterId: string, documentId: string): string {
  const dir = join(matterDocDir(matterId), 'versions', documentId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function nextVersionNumber(documentId: string): number {
  const db = getDatabase();
  const row = db
    .prepare('SELECT MAX(version_number) AS v FROM document_versions WHERE document_id = ?')
    .get(documentId) as { v: number | null };
  return (row.v ?? 0) + 1;
}

/**
 * Snapshot the current state of a document into the version log.
 * Call BEFORE overwriting the file so the "current" bytes are captured.
 */
export function snapshotCurrent(
  doc: StoredDocument,
  modifiedBy: string,
  changeSummary: string | null = null,
): DocumentVersion {
  const bytes = readFileSync(doc.storedPath);
  const version_number = nextVersionNumber(doc.id);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = extname(doc.storedPath) || '.bin';
  const snapDir = join(versionsDir(doc.matterId, doc.id), ts);
  if (!existsSync(snapDir)) mkdirSync(snapDir, { recursive: true });
  const stored_path = join(snapDir, `v${version_number}${ext}`);
  copyFileSync(doc.storedPath, stored_path);

  const id = randomUUID();
  const now = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `INSERT INTO document_versions
       (id, document_id, matter_id, version_number, stored_path,
        size_bytes, content_hash, change_summary, modified_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    doc.id,
    doc.matterId,
    version_number,
    stored_path,
    bytes.length,
    sha256(bytes),
    changeSummary,
    modifiedBy,
    now,
  );

  appendLegalAudit({
    matterId: doc.matterId,
    actorId: modifiedBy,
    action: 'document.version_snapshot',
    detail: `${doc.filename} → v${version_number}`,
    refTable: 'document_versions',
    refId: id,
    metadata: { hash: sha256(bytes), changeSummary },
  });
  logger.info(`snapshotted ${doc.filename} as v${version_number}`);
  return db.prepare('SELECT * FROM document_versions WHERE id = ?').get(id) as DocumentVersion;
}

/**
 * Replace the current document bytes with new bytes; snapshots the
 * existing version first so we never lose history.
 */
export function replaceDocumentBytes(
  doc: StoredDocument,
  newBytes: Buffer,
  modifiedBy: string,
  changeSummary?: string,
): DocumentVersion {
  // 1. Snapshot existing.
  snapshotCurrent(doc, modifiedBy, 'preserved before overwrite');
  // 2. Overwrite the canonical file.
  writeFileSync(doc.storedPath, newBytes, { mode: 0o600 });
  // 3. Update meta size.
  const metaPath = join(dirname(doc.storedPath), `${doc.id}.meta.json`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as StoredDocument;
  meta.sizeBytes = newBytes.length;
  meta.uploadedAt = new Date().toISOString();
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  // 4. Snapshot new as the "current" entry.
  return snapshotCurrent(doc, modifiedBy, changeSummary ?? null);
}

export function listVersions(documentId: string): DocumentVersion[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM document_versions WHERE document_id = ?
       ORDER BY version_number DESC`,
    )
    .all(documentId) as DocumentVersion[];
}

export function getVersion(versionId: string): DocumentVersion | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionId) as
      | DocumentVersion
      | undefined) ?? null
  );
}

/**
 * Roll a document back to a previous version. The CURRENT file bytes
 * are first snapshotted (so even rollback is reversible). Then the
 * chosen version's bytes are copied over the current file. Returns the
 * NEW snapshot row of the rolled-back state.
 */
export function rollbackToVersion(
  documentId: string,
  versionId: string,
  acting: string,
): DocumentVersion {
  const version = getVersion(versionId);
  if (!version) throw new Error(`version ${versionId} not found`);
  if (version.document_id !== documentId) {
    throw new Error(`version ${versionId} does not belong to document ${documentId}`);
  }
  const doc = getDocument(version.matter_id, documentId);
  if (!doc) throw new Error(`document ${documentId} not found`);

  // Snapshot current state first so rollback is reversible.
  snapshotCurrent(doc, acting, `pre-rollback to v${version.version_number}`);

  // Copy chosen version's bytes over the canonical file.
  copyFileSync(version.stored_path, doc.storedPath);

  appendLegalAudit({
    matterId: doc.matterId,
    actorId: acting,
    action: 'document.rollback',
    detail: `${doc.filename} rolled back to v${version.version_number}`,
    refTable: 'document_versions',
    refId: versionId,
  });

  return snapshotCurrent(doc, acting, `rollback to v${version.version_number}`);
}

export function readVersionBytes(version: DocumentVersion): Buffer {
  return readFileSync(version.stored_path);
}

export interface VersionSummary {
  documentId: string;
  filename: string;
  totalVersions: number;
  currentVersion: number;
  totalBytes: number;
}

export function summariseVersions(documentId: string, matterId: string): VersionSummary | null {
  const doc = getDocument(matterId, documentId);
  if (!doc) return null;
  const versions = listVersions(documentId);
  const totalBytes = versions.reduce((sum, v) => sum + v.size_bytes, 0)
    + (existsSync(doc.storedPath) ? statSync(doc.storedPath).size : 0);
  return {
    documentId,
    filename: doc.filename,
    totalVersions: versions.length,
    currentVersion: versions[0]?.version_number ?? 0,
    totalBytes,
  };
}

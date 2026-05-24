/**
 * Document storage helpers.
 *
 * Layout (DOCUMENTS_ROOT, defaults to data/documents/):
 *   <matter-id>/
 *     <doc-id>.<ext>           ← raw bytes
 *     <doc-id>.txt             ← extracted text (privilege-redacted COPY is
 *                                 not stored here; redaction happens at
 *                                 model-call time)
 *     <doc-id>.meta.json       ← filename, contentType, sizeBytes,
 *                                 uploadedBy, uploadedAt
 *
 * We deliberately do not write directly into the matter folder — those
 * folders mirror the firm's filing convention and shouldn't be polluted
 * with intermediate text extracts. The matter folder gets a copy of the
 * raw file via the existing inbox-staging path when the document was
 * uploaded against an existing matter.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StoredDocument {
  id: string;
  matterId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storedPath: string;
  textPath: string | null;
  uploadedBy: string;
  uploadedAt: string;
  /** Brief note about extraction (e.g. "via pdftotext", "binary missing"). */
  extractionNote: string;
  /** Length of the extracted text in chars. */
  extractedChars: number;
}

function documentsRoot(): string {
  return process.env.DOCUMENTS_ROOT
    || (process.env.NODE_ENV === 'production' ? '/data/documents' : './data/documents');
}

export function matterDocDir(matterId: string): string {
  return join(documentsRoot(), matterId);
}

export interface StoreDocumentInput {
  matterId: string;
  filename: string;
  contentType: string;
  data: Buffer;
  extractedText: string;
  extractionNote: string;
  uploadedBy: string;
}

export function storeDocument(input: StoreDocumentInput): StoredDocument {
  const id = randomUUID();
  const dir = matterDocDir(input.matterId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const ext = extname(input.filename) || '.bin';
  const storedPath = join(dir, `${id}${ext}`);
  writeFileSync(storedPath, input.data, { mode: 0o600 });

  let textPath: string | null = null;
  if (input.extractedText) {
    textPath = join(dir, `${id}.txt`);
    writeFileSync(textPath, input.extractedText, { mode: 0o600 });
  }

  const meta: StoredDocument = {
    id,
    matterId: input.matterId,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.data.length,
    storedPath,
    textPath,
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
    extractionNote: input.extractionNote,
    extractedChars: input.extractedText.length,
  };
  writeFileSync(join(dir, `${id}.meta.json`), JSON.stringify(meta, null, 2));
  return meta;
}

export function listMatterDocuments(matterId: string): StoredDocument[] {
  const dir = matterDocDir(matterId);
  if (!existsSync(dir)) return [];
  const out: StoredDocument[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.meta.json')) continue;
    try {
      const raw = readFileSync(join(dir, entry), 'utf8');
      out.push(JSON.parse(raw) as StoredDocument);
    } catch {
      // Ignore corrupt meta files; the operator can clean them up.
    }
  }
  out.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return out;
}

export function getDocument(matterId: string, docId: string): StoredDocument | null {
  const metaPath = join(matterDocDir(matterId), `${docId}.meta.json`);
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8')) as StoredDocument;
  } catch {
    return null;
  }
}

export function readDocumentBytes(doc: StoredDocument): Buffer {
  return readFileSync(doc.storedPath);
}

export function readDocumentText(doc: StoredDocument): string | null {
  if (!doc.textPath || !existsSync(doc.textPath)) return null;
  return readFileSync(doc.textPath, 'utf8');
}

export interface DocumentDirSummary {
  totalBytes: number;
  fileCount: number;
}

export function summariseMatterDocs(matterId: string): DocumentDirSummary {
  const dir = matterDocDir(matterId);
  if (!existsSync(dir)) return { totalBytes: 0, fileCount: 0 };
  let total = 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.meta.json')) continue;
    try {
      const s = statSync(join(dir, entry));
      total += s.size;
      count += 1;
    } catch { /* ignore */ }
  }
  return { totalBytes: total, fileCount: count };
}

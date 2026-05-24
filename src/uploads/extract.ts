/**
 * Local text extraction for uploaded documents.
 *
 * Privilege constraint: text extraction MUST run on-prem before any
 * external API call. We do not ship the raw file to an AI model.
 *
 * Supported types:
 *   - text/plain         → utf-8 decode
 *   - .docx              → mammoth.extractRawText
 *   - .doc (legacy)      → best-effort: try `antiword` then `catdoc` system
 *                          binaries; fall through to a "use save-as DOCX"
 *                          hint on failure
 *   - .pdf               → best-effort: try `pdftotext` (poppler-utils)
 *                          system binary; fall through to a raw-byte
 *                          fallback that pulls visible ASCII strings
 *
 * Every extractor returns at least an empty string + a note explaining
 * why extraction was partial / failed. Callers store the note alongside
 * the document so the lawyer can decide whether to re-upload.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Extract');

export interface ExtractResult {
  /** Extracted plain text — possibly empty. */
  text: string;
  /** Human-readable note about the extraction (e.g. "via pdftotext", "binary missing"). */
  note: string;
  /** Detected MIME / kind ("docx", "pdf", "txt", "doc", "unknown"). */
  kind: string;
}

function which(cmd: string): boolean {
  const res = spawnSync('which', [cmd], { encoding: 'utf8' });
  return res.status === 0;
}

function runPiped(cmd: string, args: string[], stdin?: Buffer, timeoutMs = 20_000): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, { input: stdin, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

function detectKind(filename: string, contentType: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'txt';
  if (contentType.startsWith('text/')) return 'txt';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'application/msword') return 'doc';
  if (contentType.includes('officedocument.wordprocessingml.document')) return 'docx';
  return 'unknown';
}

async function extractDocx(data: Buffer): Promise<ExtractResult> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: data });
    return { text: (result.value ?? '').trim(), note: 'via mammoth', kind: 'docx' };
  } catch (err) {
    return {
      text: '',
      note: `docx extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      kind: 'docx',
    };
  }
}

function extractTxt(data: Buffer): ExtractResult {
  return { text: data.toString('utf8'), note: 'utf-8 decode', kind: 'txt' };
}

function extractPdfViaPdftotext(data: Buffer): ExtractResult | null {
  if (!which('pdftotext')) return null;
  const dir = mkdtempSync(join(tmpdir(), 'lo-pdf-'));
  const inFile = join(dir, 'in.pdf');
  try {
    writeFileSync(inFile, data);
    const res = runPiped('pdftotext', ['-layout', '-q', inFile, '-']);
    if (res.code === 0) return { text: res.stdout.trim(), note: 'via pdftotext', kind: 'pdf' };
    return { text: '', note: `pdftotext failed: ${res.stderr.slice(0, 200)}`, kind: 'pdf' };
  } finally {
    try { unlinkSync(inFile); } catch { /* ignore */ }
  }
}

/**
 * Last-resort PDF text extraction: pull printable ASCII strings out of
 * the raw bytes. Misses anything inside compressed streams (which is
 * most modern PDFs) but produces something useful for old text-based
 * exports. Always returns a note flagging the limitation.
 */
function extractPdfFallback(data: Buffer): ExtractResult {
  const ascii = data.toString('latin1');
  const matches = ascii.match(/[\x20-\x7E]{6,}/g) ?? [];
  // Strip PDF-syntax noise (object refs, dictionaries).
  const filtered = matches.filter((s) =>
    !/^[0-9]+\s+[0-9]+\s+(obj|R)\s*$/.test(s) &&
    !/^<<\/|^>>$/.test(s) &&
    !/^\/[A-Z][A-Za-z0-9]+(\s|$)/.test(s),
  );
  return {
    text: filtered.join(' ').slice(0, 200_000),
    note: 'fallback ASCII string scan (pdftotext not installed). Install poppler-utils for full extraction.',
    kind: 'pdf',
  };
}

function extractPdf(data: Buffer): ExtractResult {
  const viaTool = extractPdfViaPdftotext(data);
  if (viaTool && viaTool.text) return viaTool;
  return extractPdfFallback(data);
}

function extractDocLegacy(data: Buffer): ExtractResult {
  for (const cmd of ['antiword', 'catdoc']) {
    if (!which(cmd)) continue;
    const dir = mkdtempSync(join(tmpdir(), 'lo-doc-'));
    const inFile = join(dir, 'in.doc');
    try {
      writeFileSync(inFile, data);
      const res = runPiped(cmd, [inFile]);
      if (res.code === 0 && res.stdout.trim()) {
        return { text: res.stdout.trim(), note: `via ${cmd}`, kind: 'doc' };
      }
    } finally {
      try { unlinkSync(inFile); } catch { /* ignore */ }
    }
  }
  return {
    text: '',
    note: 'legacy .doc extraction unavailable. Ask the sender to re-save as .docx.',
    kind: 'doc',
  };
}

export async function extractText(
  data: Buffer,
  filename: string,
  contentType: string,
): Promise<ExtractResult> {
  const kind = detectKind(filename, contentType);
  let result: ExtractResult;
  try {
    switch (kind) {
      case 'docx': result = await extractDocx(data); break;
      case 'txt':  result = extractTxt(data); break;
      case 'pdf':  result = extractPdf(data); break;
      case 'doc':  result = extractDocLegacy(data); break;
      default:     result = { text: '', note: `unsupported kind: ${kind} (${contentType})`, kind };
    }
  } catch (err) {
    result = {
      text: '',
      note: `extraction crashed: ${err instanceof Error ? err.message : String(err)}`,
      kind,
    };
  }
  logger.info(`extracted ${result.text.length} chars from ${filename} (${result.kind}, ${result.note})`);
  return result;
}

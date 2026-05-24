/**
 * Minimal multipart/form-data parser.
 *
 * Built-in node:http does not parse multipart bodies, and we deliberately
 * don't pull in a dependency for one route. This parser is intentionally
 * narrow:
 *
 *   - One pass, streaming-friendly chunk concatenation.
 *   - Hard cap on total body size.
 *   - Returns parsed fields + file parts as Buffers (callers decide
 *     where to persist).
 *   - Throws on malformed envelopes; never on inputs that just lack a
 *     part we expected.
 *
 * Boundary parsing uses an explicit Buffer search so we never decode
 * binary bytes into UTF-8 strings (which would corrupt PDFs / DOCX).
 */

import type { IncomingMessage } from 'node:http';

export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  fields: Record<string, string>;
  files: MultipartFile[];
}

const CRLF = Buffer.from('\r\n');
const DOUBLE_CRLF = Buffer.from('\r\n\r\n');
const DASH_DASH = Buffer.from('--');

function indexOfBuffer(haystack: Buffer, needle: Buffer, from = 0): number {
  return haystack.indexOf(needle, from);
}

function parseHeader(headerBlock: string): { name: string; filename: string | null; contentType: string } {
  const lines = headerBlock.split('\r\n');
  let name = '';
  let filename: string | null = null;
  let contentType = 'application/octet-stream';
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('content-disposition:')) {
      const nameMatch = line.match(/name="([^"]*)"/);
      if (nameMatch) name = nameMatch[1];
      const filenameMatch = line.match(/filename="([^"]*)"/);
      if (filenameMatch) filename = filenameMatch[1];
    } else if (lower.startsWith('content-type:')) {
      contentType = line.split(':', 2)[1].trim();
    }
  }
  return { name, filename, contentType };
}

export interface ParseMultipartOptions {
  maxBytes: number;
}

export async function parseMultipart(
  req: IncomingMessage,
  opts: ParseMultipartOptions,
): Promise<MultipartResult> {
  const contentType = req.headers['content-type'] ?? '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) throw new Error('multipart boundary missing from Content-Type');
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const boundaryBuf = Buffer.concat([DASH_DASH, Buffer.from(boundary)]);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > opts.maxBytes) throw new Error(`request body exceeds ${opts.maxBytes} bytes`);
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);

  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  let pos = indexOfBuffer(body, boundaryBuf, 0);
  if (pos < 0) throw new Error('no opening boundary found');
  pos += boundaryBuf.length;

  while (pos < body.length) {
    // After a boundary we expect either "--" (end of multipart) or CRLF + part.
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // "--"
    if (body[pos] === 0x0d && body[pos + 1] === 0x0a) pos += 2;

    const headerEnd = indexOfBuffer(body, DOUBLE_CRLF, pos);
    if (headerEnd < 0) throw new Error('multipart part header not terminated');
    const headerText = body.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + DOUBLE_CRLF.length;

    const nextBoundary = indexOfBuffer(body, boundaryBuf, pos);
    if (nextBoundary < 0) throw new Error('next boundary missing');

    // The trailing CRLF before the boundary is part of the envelope,
    // not the data, so trim it.
    const dataEnd = nextBoundary - CRLF.length;
    const data = body.slice(pos, dataEnd);
    pos = nextBoundary + boundaryBuf.length;

    const header = parseHeader(headerText);
    if (header.filename) {
      files.push({
        fieldName: header.name,
        filename: header.filename,
        contentType: header.contentType,
        data,
      });
    } else if (header.name) {
      fields[header.name] = data.toString('utf8');
    }
  }

  return { fields, files };
}

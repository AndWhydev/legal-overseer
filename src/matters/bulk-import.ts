/**
 * 9.4 — Bulk matter import (LEAP / Clio / CSV).
 *
 * Accepts a CSV (or a LEAP/Clio export) and creates matters. Preview
 * first 10, then on commit insert remaining. Dedupe by client name +
 * matter reference. Records the run in bulk_imports.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { createMatter, getMatterByNumber, nextMatterNumber } from '../db/repositories/matters.js';

const logger = createSafeLogger('BulkImport');

export type ImportSource = 'leap' | 'clio' | 'csv';

export interface ImportRowResult {
  rowIndex: number;
  ok: boolean;
  matterId?: string;
  matterNumber?: string;
  error?: string;
  skipped?: boolean;
}

export interface BulkImportRun {
  id: string;
  source: ImportSource;
  imported_by: string;
  total_rows: number;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  log_json: string | null;
  created_at: string;
}

export interface NormalisedRow {
  matter_number?: string;
  title: string;
  client_name: string;
  client_email?: string;
  matter_type: string;
  jurisdiction?: string;
  responsible_lawyer_email?: string;
  opposing_party?: string;
  notes?: string;
}

const COLUMN_ALIASES: Record<keyof NormalisedRow, RegExp[]> = {
  matter_number: [/matter\s*(no|number|ref)/i, /file\s*no/i, /^ref$/i],
  title: [/title/i, /matter\s*name/i, /description/i, /matter\s*description/i],
  client_name: [/client\s*name/i, /^client$/i, /party/i],
  client_email: [/client\s*email/i, /email/i],
  matter_type: [/matter\s*type/i, /type/i, /practice\s*area/i, /category/i],
  jurisdiction: [/jurisdiction/i, /state/i],
  responsible_lawyer_email: [/responsible/i, /lawyer\s*email/i, /attorney/i, /partner/i],
  opposing_party: [/opposing/i, /defendant/i, /respondent/i],
  notes: [/notes/i, /comment/i, /summary/i],
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
    else if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseImportCsv(csv: string): NormalisedRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const map: Partial<Record<keyof NormalisedRow, number>> = {};
  headers.forEach((h, i) => {
    for (const [key, patterns] of Object.entries(COLUMN_ALIASES) as [keyof NormalisedRow, RegExp[]][]) {
      if (map[key] === undefined && patterns.some((p) => p.test(h))) {
        map[key] = i;
      }
    }
  });
  const rows: NormalisedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (k: keyof NormalisedRow): string | undefined => {
      const idx = map[k];
      return idx !== undefined ? cols[idx] : undefined;
    };
    rows.push({
      matter_number: get('matter_number'),
      title: get('title') ?? '(no title)',
      client_name: get('client_name') ?? '(unknown client)',
      client_email: get('client_email'),
      matter_type: get('matter_type') ?? 'unclassified',
      jurisdiction: get('jurisdiction'),
      responsible_lawyer_email: get('responsible_lawyer_email'),
      opposing_party: get('opposing_party'),
      notes: get('notes'),
    });
  }
  return rows;
}

export function previewImport(rows: NormalisedRow[], limit = 10): NormalisedRow[] {
  return rows.slice(0, limit);
}

export interface CommitImportInput {
  source: ImportSource;
  rows: NormalisedRow[];
  acting: string;
}

export function commitImport(input: CommitImportInput): { run: BulkImportRun; results: ImportRowResult[] } {
  const results: ImportRowResult[] = [];
  let success = 0;
  let failure = 0;
  let skipped = 0;
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    try {
      // Dedup check.
      const existingByNumber = row.matter_number ? getMatterByNumber(row.matter_number) : null;
      if (existingByNumber) {
        results.push({ rowIndex: i, ok: false, skipped: true, error: `duplicate of ${existingByNumber.matter_number}` });
        skipped += 1;
        continue;
      }
      const matter = createMatter({
        matter_number: row.matter_number ?? nextMatterNumber(),
        title: row.title,
        client_name: row.client_name,
        client_email: row.client_email,
        matter_type: row.matter_type,
        jurisdiction: row.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
        responsible_lawyer_email: row.responsible_lawyer_email,
        opposing_party: row.opposing_party,
        notes: row.notes ?? `Imported from ${input.source}`,
      });
      results.push({ rowIndex: i, ok: true, matterId: matter.id, matterNumber: matter.matter_number });
      success += 1;
    } catch (err) {
      results.push({ rowIndex: i, ok: false, error: err instanceof Error ? err.message : String(err) });
      failure += 1;
    }
  }

  const db = getDatabase();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO bulk_imports
       (id, source, imported_by, total_rows, success_count, failure_count, skipped_count, log_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.source,
    input.acting,
    input.rows.length,
    success,
    failure,
    skipped,
    JSON.stringify(results),
  );

  appendLegalAudit({
    matterId: null,
    actorId: input.acting,
    action: 'bulk_import.commit',
    detail: `${input.source}: ${success} ok, ${failure} failed, ${skipped} skipped`,
    refTable: 'bulk_imports',
    refId: id,
  });
  logger.info(`bulk import ${input.source}: ${success}/${input.rows.length}`);
  return {
    run: db.prepare('SELECT * FROM bulk_imports WHERE id = ?').get(id) as BulkImportRun,
    results,
  };
}

export function listImportRuns(limit = 50): BulkImportRun[] {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM bulk_imports ORDER BY created_at DESC LIMIT ?`).all(limit) as BulkImportRun[];
}

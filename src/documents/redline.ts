/**
 * 2.6 — Redline comparison.
 *
 * Diffs two text bodies line-by-line and returns:
 *   - HTML rendered with additions (green), deletions (red), unchanged
 *     (black);
 *   - counts of additions / removals / modifications;
 *   - a record in redline_comparisons so the dashboard can list past
 *     comparisons.
 *
 * The diff algorithm is a classic LCS implementation; no external
 * dependency, keeps the on-prem footprint small.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../db/connection.js';
import { createSafeLogger } from '../governance/index.js';
import { appendLegalAudit } from '../compliance/audit.js';

const logger = createSafeLogger('Redline');

export interface RedlineComparison {
  id: string;
  matter_id: string | null;
  left_doc_label: string;
  right_doc_label: string;
  added_count: number;
  removed_count: number;
  modified_count: number;
  html_path: string;
  created_by: string;
  created_at: string;
}

interface DiffOp {
  kind: 'add' | 'remove' | 'same';
  text: string;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * Classic LCS-based diff producing a list of add/remove/same ops.
 * Cap line counts to keep this O(n*m) within reason; for very long
 * documents the caller should chunk by section.
 */
function diffLines(left: string[], right: string[]): DiffOp[] {
  const maxLines = 5000;
  const a = left.slice(0, maxLines);
  const b = right.slice(0, maxLines);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'same', text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ kind: 'remove', text: a[i - 1] });
      i -= 1;
    } else {
      ops.push({ kind: 'add', text: b[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) { ops.push({ kind: 'remove', text: a[i - 1] }); i -= 1; }
  while (j > 0) { ops.push({ kind: 'add', text: b[j - 1] }); j -= 1; }
  ops.reverse();
  return ops;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(ops: DiffOp[], leftLabel: string, rightLabel: string): string {
  const lines = ops.map((op) => {
    const cls = op.kind === 'add' ? 'add' : op.kind === 'remove' ? 'remove' : 'same';
    const prefix = op.kind === 'add' ? '+ ' : op.kind === 'remove' ? '- ' : '  ';
    return `<div class="${cls}">${escapeHtml(prefix + op.text)}</div>`;
  });
  return `<!doctype html><meta charset="utf-8"><title>Redline ${escapeHtml(leftLabel)} → ${escapeHtml(rightLabel)}</title>
<style>
  body { background: #fafafa; color: #111; font: 13px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; margin: 0; padding: 16px; }
  h1 { font-size: 16px; color: #333; }
  .header { margin-bottom: 16px; }
  .pane { background: #fff; border: 1px solid #ddd; padding: 16px; border-radius: 6px; white-space: pre-wrap; }
  .add { background: #ddffdd; color: #003300; }
  .remove { background: #ffdddd; color: #660000; text-decoration: line-through; }
  .same { color: #444; }
  .counts { color: #555; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
</style>
<div class="header">
  <h1>Redline: ${escapeHtml(leftLabel)} → ${escapeHtml(rightLabel)}</h1>
  <div class="counts">${ops.filter((o) => o.kind === 'add').length} additions, ${ops.filter((o) => o.kind === 'remove').length} removals</div>
</div>
<div class="pane">${lines.join('\n')}</div>`;
}

export interface CompareInput {
  leftText: string;
  rightText: string;
  leftLabel: string;
  rightLabel: string;
  matterId?: string;
  acting: string;
}

export interface CompareResult extends RedlineComparison {
  html: string;
  ops: DiffOp[];
}

function redlineRoot(): string {
  return process.env.REDLINE_ROOT
    ?? (process.env.NODE_ENV === 'production' ? '/data/redlines' : './data/redlines');
}

export function compareTexts(input: CompareInput): CompareResult {
  const left = splitLines(input.leftText);
  const right = splitLines(input.rightText);
  const ops = diffLines(left, right);
  const added = ops.filter((o) => o.kind === 'add').length;
  const removed = ops.filter((o) => o.kind === 'remove').length;
  const modified = Math.min(added, removed);

  const html = renderHtml(ops, input.leftLabel, input.rightLabel);

  // Persist the HTML to disk.
  const id = randomUUID();
  const dir = redlineRoot();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const html_path = join(dir, `${id}.html`);
  writeFileSync(html_path, html, { mode: 0o600 });

  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO redline_comparisons
       (id, matter_id, left_doc_label, right_doc_label,
        added_count, removed_count, modified_count, html_path,
        created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.matterId ?? null,
    input.leftLabel,
    input.rightLabel,
    added,
    removed,
    modified,
    html_path,
    input.acting,
    now,
  );

  appendLegalAudit({
    matterId: input.matterId ?? null,
    actorId: input.acting,
    action: 'redline.compare',
    detail: `${input.leftLabel} → ${input.rightLabel} (+${added}/-${removed})`,
    refTable: 'redline_comparisons',
    refId: id,
  });

  logger.info(`redline ${input.leftLabel} → ${input.rightLabel}: +${added} -${removed}`);

  const row = db
    .prepare('SELECT * FROM redline_comparisons WHERE id = ?')
    .get(id) as RedlineComparison;
  return { ...row, html, ops };
}

export function getRedlineComparison(id: string): RedlineComparison | null {
  const db = getDatabase();
  return (
    (db.prepare('SELECT * FROM redline_comparisons WHERE id = ?').get(id) as
      | RedlineComparison
      | undefined) ?? null
  );
}

export function listRedlineComparisons(matterId?: string): RedlineComparison[] {
  const db = getDatabase();
  if (matterId) {
    return db
      .prepare(
        `SELECT * FROM redline_comparisons WHERE matter_id = ? ORDER BY created_at DESC`,
      )
      .all(matterId) as RedlineComparison[];
  }
  return db
    .prepare(`SELECT * FROM redline_comparisons ORDER BY created_at DESC LIMIT 100`)
    .all() as RedlineComparison[];
}

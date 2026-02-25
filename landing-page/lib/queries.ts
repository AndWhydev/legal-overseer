import db from './db';
import type { AnalysisResult, ApprovalItem, AuditLogEntry, FilterOptions, Lane, LaneCounts } from './types';

/**
 * Get approval items by lane with optional filters
 */
export function getItemsByLane(
  lane: Lane,
  filters?: Omit<FilterOptions, 'lane'>
): ApprovalItem[] {
  let sql = `
    SELECT * FROM approval_items
    WHERE lane = ?
  `;
  const params: (string | number)[] = [lane];

  // Apply filters
  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }

  if (filters?.type) {
    sql += ` AND type = ?`;
    params.push(filters.type);
  }

  if (filters?.priority) {
    sql += ` AND priority = ?`;
    params.push(filters.priority);
  }

  if (filters?.risk_level) {
    sql += ` AND risk_level = ?`;
    params.push(filters.risk_level);
  }

  // Due date filter
  if (filters?.due_date_filter) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (filters.due_date_filter) {
      case 'overdue':
        sql += ` AND due_date < ? AND due_date IS NOT NULL`;
        params.push(today);
        break;
      case 'today':
        sql += ` AND date(due_date) = date(?)`;
        params.push(today);
        break;
      case 'this_week': {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        sql += ` AND due_date >= ? AND due_date <= ?`;
        params.push(today, weekEndStr);
        break;
      }
      case 'no_due_date':
        sql += ` AND due_date IS NULL`;
        break;
      // 'all' - no filter needed
    }
  }

  // Sort: overdue first, then by priority (urgent > high > normal > low), then by created_at desc
  sql += `
    ORDER BY
      CASE
        WHEN due_date IS NOT NULL AND due_date < date('now') THEN 0
        ELSE 1
      END ASC,
      CASE priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
      END ASC,
      created_at DESC
  `;

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as ApprovalItem[];

  // Convert has_shipping_insurance from 0/1 to boolean
  return rows.map(row => ({
    ...row,
    has_shipping_insurance: Boolean(row.has_shipping_insurance),
  }));
}

/**
 * Get counts of pending items per lane
 */
export function getItemCounts(): LaneCounts {
  const stmt = db.prepare(`
    SELECT
      lane,
      COUNT(*) as count
    FROM approval_items
    WHERE status = 'pending'
    GROUP BY lane
  `);

  const rows = stmt.all() as Array<{ lane: Lane; count: number }>;

  const counts: LaneCounts = { xixi: 0, allen: 0 };
  for (const row of rows) {
    counts[row.lane] = row.count;
  }

  return counts;
}

/**
 * Get a single approval item by ID
 */
export function getItemById(id: number): ApprovalItem | null {
  const stmt = db.prepare('SELECT * FROM approval_items WHERE id = ?');
  const row = stmt.get(id) as ApprovalItem | undefined;

  if (!row) return null;

  return {
    ...row,
    has_shipping_insurance: Boolean(row.has_shipping_insurance),
  };
}

/**
 * Get audit log entries for an approval item
 */
export function getAuditLogForItem(id: number): AuditLogEntry[] {
  const stmt = db.prepare(`
    SELECT * FROM audit_log
    WHERE approval_item_id = ?
    ORDER BY created_at ASC
  `);
  const rows = stmt.all(id) as AuditLogEntry[];
  return rows;
}

/**
 * Save an analysis record with auto-incrementing version
 */
export function saveAnalysisRecord(
  itemId: number,
  analysis: AnalysisResult,
  model: string
): number {
  // Get current max version for this item
  const versionRow = db.prepare(
    'SELECT MAX(version) as max_version FROM analysis_records WHERE approval_item_id = ?'
  ).get(itemId) as { max_version: number | null };
  const version = (versionRow?.max_version || 0) + 1;

  const stmt = db.prepare(`
    INSERT INTO analysis_records (
      approval_item_id, version, model, summary, recommendation, confidence,
      reasoning, risk_flags, draft_response, questions_for_human,
      suggested_tasks, policies_applied, generation_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    itemId,
    version,
    model,
    analysis.summary,
    analysis.recommendation,
    analysis.confidence,
    analysis.reasoning,
    JSON.stringify(analysis.risk_flags),
    analysis.draft_response,
    JSON.stringify(analysis.questions_for_human),
    JSON.stringify(analysis.suggested_tasks),
    JSON.stringify(analysis.policies_applied),
    analysis.generation_time_ms
  );

  return result.lastInsertRowid as number;
}

/**
 * Get the latest analysis for an approval item
 */
export function getLatestAnalysis(itemId: number): AnalysisResult | null {
  const row = db.prepare(`
    SELECT * FROM analysis_records
    WHERE approval_item_id = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(itemId) as {
    summary: string;
    recommendation: 'approve' | 'needs_changes' | 'reject' | 'escalate';
    confidence: number;
    reasoning: string;
    risk_flags: string | null;
    draft_response: string | null;
    questions_for_human: string | null;
    suggested_tasks: string | null;
    policies_applied: string | null;
    generation_time_ms: number;
  } | undefined;

  if (!row) return null;

  return {
    summary: row.summary,
    recommendation: row.recommendation,
    confidence: row.confidence,
    reasoning: row.reasoning,
    risk_flags: JSON.parse(row.risk_flags || '[]'),
    draft_response: row.draft_response,
    questions_for_human: JSON.parse(row.questions_for_human || '[]'),
    suggested_tasks: JSON.parse(row.suggested_tasks || '[]'),
    policies_applied: JSON.parse(row.policies_applied || '[]'),
    generation_time_ms: row.generation_time_ms,
  };
}

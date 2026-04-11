import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportEntityType =
  | 'contacts'
  | 'projects'
  | 'invoices'
  | 'leads'
  | 'agent_runs'
  | 'audit_log';

export type ExportFormat = 'csv' | 'json';

const VALID_ENTITIES: ExportEntityType[] = [
  'contacts',
  'projects',
  'invoices',
  'leads',
  'agent_runs',
  'audit_log',
];

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportEntities(
  supabase: SupabaseClient,
  orgId: string,
  entityType: ExportEntityType,
  format: ExportFormat = 'json',
): Promise<{ data: string; contentType: string; filename: string }> {
  if (!VALID_ENTITIES.includes(entityType)) {
    throw new Error(`Invalid entity type: ${entityType}`);
  }

  const { data, error } = await supabase
    .from(entityType)
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    throw new Error(`Export failed: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    return {
      data: toCsv(rows),
      contentType: 'text/csv',
      filename: `${entityType}_${timestamp}.csv`,
    };
  }

  return {
    data: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
    filename: `${entityType}_${timestamp}.json`,
  };
}

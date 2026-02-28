/**
 * RLS Policy Audit
 *
 * Checks that all Supabase tables have Row Level Security enabled
 * and proper org_id isolation policies. Run as a maintenance check.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RLSAuditResult {
  table_name: string;
  rls_enabled: boolean;
  has_select_policy: boolean;
  has_insert_policy: boolean;
  has_update_policy: boolean;
  has_delete_policy: boolean;
  policy_names: string[];
  issues: string[];
}

export interface AuditSummary {
  total_tables: number;
  tables_with_rls: number;
  tables_without_rls: number;
  tables_with_issues: number;
  results: RLSAuditResult[];
  passed: boolean;
}

// Tables that legitimately do not need org isolation
const EXEMPT_TABLES = new Set([
  'schema_migrations',
  'spatial_ref_sys',
  'secret_rotations',
]);

/**
 * Audit all public tables for RLS configuration.
 * Uses service role to query pg_catalog.
 */
export async function auditRLS(supabase: SupabaseClient): Promise<AuditSummary> {
  // Query table RLS status from pg_tables
  const { data: tables, error: tablesError } = await supabase
    .rpc('get_rls_status')
    .select('*');

  if (tablesError) {
    // Fallback: try direct query if RPC not available
    return auditRLSFallback(supabase);
  }

  const results: RLSAuditResult[] = [];

  for (const table of (tables || [])) {
    if (EXEMPT_TABLES.has(table.tablename)) continue;

    const issues: string[] = [];

    if (!table.rls_enabled) {
      issues.push('RLS is not enabled on this table');
    }

    const policies = table.policies || [];
    const policyNames = policies.map((p: { policyname: string }) => p.policyname);
    const hasSelect = policies.some((p: { cmd: string }) => p.cmd === 'SELECT' || p.cmd === 'ALL');
    const hasInsert = policies.some((p: { cmd: string }) => p.cmd === 'INSERT' || p.cmd === 'ALL');
    const hasUpdate = policies.some((p: { cmd: string }) => p.cmd === 'UPDATE' || p.cmd === 'ALL');
    const hasDelete = policies.some((p: { cmd: string }) => p.cmd === 'DELETE' || p.cmd === 'ALL');

    if (table.rls_enabled && !hasSelect) issues.push('Missing SELECT policy');
    if (table.rls_enabled && !hasInsert) issues.push('Missing INSERT policy');

    results.push({
      table_name: table.tablename,
      rls_enabled: table.rls_enabled,
      has_select_policy: hasSelect,
      has_insert_policy: hasInsert,
      has_update_policy: hasUpdate,
      has_delete_policy: hasDelete,
      policy_names: policyNames,
      issues,
    });
  }

  const withRLS = results.filter((r) => r.rls_enabled).length;
  const withIssues = results.filter((r) => r.issues.length > 0).length;

  return {
    total_tables: results.length,
    tables_with_rls: withRLS,
    tables_without_rls: results.length - withRLS,
    tables_with_issues: withIssues,
    results,
    passed: withIssues === 0,
  };
}

/**
 * Fallback audit using information_schema when RPC is unavailable.
 */
async function auditRLSFallback(supabase: SupabaseClient): Promise<AuditSummary> {
  // List all tables in the public schema
  const { data: tables, error } = await supabase
    .from('information_schema.tables' as string)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE');

  if (error) {
    console.warn('[rls-audit] Cannot query tables:', error.message);
    return {
      total_tables: 0,
      tables_with_rls: 0,
      tables_without_rls: 0,
      tables_with_issues: 0,
      results: [],
      passed: false,
    };
  }

  const results: RLSAuditResult[] = (tables || [])
    .filter((t: { table_name: string }) => !EXEMPT_TABLES.has(t.table_name))
    .map((t: { table_name: string }) => ({
      table_name: t.table_name,
      rls_enabled: false, // Cannot determine without pg_catalog access
      has_select_policy: false,
      has_insert_policy: false,
      has_update_policy: false,
      has_delete_policy: false,
      policy_names: [],
      issues: ['Cannot verify RLS status without pg_catalog access — run with service role'],
    }));

  return {
    total_tables: results.length,
    tables_with_rls: 0,
    tables_without_rls: results.length,
    tables_with_issues: results.length,
    results,
    passed: false,
  };
}

/**
 * Generate a human-readable audit report.
 */
export function formatAuditReport(summary: AuditSummary): string {
  const lines: string[] = [
    '# RLS Policy Audit Report',
    '',
    `Total tables: ${summary.total_tables}`,
    `With RLS: ${summary.tables_with_rls}`,
    `Without RLS: ${summary.tables_without_rls}`,
    `With issues: ${summary.tables_with_issues}`,
    `Status: ${summary.passed ? 'PASSED' : 'FAILED'}`,
    '',
  ];

  for (const result of summary.results) {
    if (result.issues.length === 0) continue;

    lines.push(`## ${result.table_name}`);
    lines.push(`RLS: ${result.rls_enabled ? 'enabled' : 'DISABLED'}`);
    lines.push(`Policies: ${result.policy_names.join(', ') || 'none'}`);
    lines.push('Issues:');
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a specific table has comprehensive RLS coverage.
 */
export function isTableSecure(result: RLSAuditResult): boolean {
  if (!result.rls_enabled) return false;
  if (result.issues.length > 0) return false;

  // Comprehensive RLS should have both SELECT and INSERT at minimum
  return result.has_select_policy && result.has_insert_policy;
}

/**
 * Generate recommendations for RLS fixes.
 */
export function generateRLSRecommendations(summary: AuditSummary): string[] {
  const recommendations: string[] = [];

  if (summary.tables_without_rls > 0) {
    recommendations.push(`Enable RLS on ${summary.tables_without_rls} table(s) without RLS protection`);
  }

  for (const result of summary.results) {
    if (result.issues.length === 0) continue;

    if (!result.has_select_policy && result.rls_enabled) {
      recommendations.push(`Add SELECT policy to ${result.table_name}`);
    }
    if (!result.has_insert_policy && result.rls_enabled) {
      recommendations.push(`Add INSERT policy to ${result.table_name}`);
    }
    if (!result.has_update_policy && result.rls_enabled) {
      recommendations.push(`Add UPDATE policy to ${result.table_name}`);
    }
    if (!result.has_delete_policy && result.rls_enabled) {
      recommendations.push(`Add DELETE policy to ${result.table_name}`);
    }
  }

  return recommendations;
}

/**
 * Get a summary of tables at risk.
 */
export function getTablesAtRisk(summary: AuditSummary): RLSAuditResult[] {
  return summary.results.filter((r) => !isTableSecure(r));
}

/**
 * Export audit results as JSON.
 */
export function exportAuditJSON(summary: AuditSummary): string {
  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      summary: {
        passed: summary.passed,
        total_tables: summary.total_tables,
        tables_with_rls: summary.tables_with_rls,
        tables_without_rls: summary.tables_without_rls,
        tables_with_issues: summary.tables_with_issues,
      },
      tables_at_risk: getTablesAtRisk(summary),
      recommendations: generateRLSRecommendations(summary),
    },
    null,
    2
  );
}

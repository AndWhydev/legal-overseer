import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auditRLS, formatAuditReport, exportAuditJSON } from '@/lib/security/rls-audit'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RLS Policy Audit Endpoint
 * GET /api/admin/rls-audit
 *
 * Runs a comprehensive RLS audit on all tables in the public schema.
 * Returns audit results as JSON with table status, policies, and issues.
 *
 * Auth: Requires admin user (owner or admin role in org_members)
 */
export async function GET(request: NextRequest) {
  // --- Auth Check ---
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    logger.error('[rls-audit] Supabase credentials not configured')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (!token) {
    logger.warn('[rls-audit] Missing authorization token')
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
  }

  // Get authenticated user
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    logger.warn('[rls-audit] Unauthorized access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Role-based admin check via org_members
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .single()
  const isAdmin = !!membership
  if (!isAdmin) {
    logger.warn(`[rls-audit] Non-admin user ${user.id} attempted access`)
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
  }

  try {
    // Run the RLS audit
    logger.info('[rls-audit] Starting RLS audit for all tables')
    const summary = await auditRLS(supabase)

    // Return results in JSON format
    const jsonReport = exportAuditJSON(summary)

    logger.info(`[rls-audit] Audit complete: ${summary.tables_with_issues} tables with issues`)

    return NextResponse.json(JSON.parse(jsonReport), {
      status: summary.passed ? 200 : 206,
      headers: {
        'Content-Type': 'application/json',
        'X-RLS-Audit-Passed': summary.passed ? 'true' : 'false',
        'X-RLS-Tables-Audited': String(summary.total_tables),
        'X-RLS-Tables-With-Issues': String(summary.tables_with_issues),
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[rls-audit] Audit failed:', errorMsg)
    return NextResponse.json(
      { error: 'Audit failed', details: errorMsg },
      { status: 500 }
    )
  }
}

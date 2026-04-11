import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

/**
 * Resolve the authenticated user and their org_id.
 */
async function resolveUserOrg() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Service not configured' }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return { error: NextResponse.json({ error: 'No organization found' }, { status: 404 }) }
  }

  return { supabase, user, orgId: profile.org_id as string }
}

/**
 * GET /api/workflows/[id]/runs
 * Fetch workflow run history linked to a specific workflow rule.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveUserOrg()
    if ('error' in auth && !('supabase' in auth)) return auth.error

    const { supabase } = auth as {
      supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>
      user: { id: string }
      orgId: string
    }

    const { id } = await params

    const { data: runs, error } = await supabase
      .from('role_workflows')
      .select('*')
      .eq('workflow_rule_id', id)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) {
      logger.error('GET /api/workflows/[id]/runs query error:', error)
      return NextResponse.json({ error: 'Failed to fetch workflow runs' }, { status: 500 })
    }

    return NextResponse.json({ runs: runs ?? [] })
  } catch (err) {
    logger.error('GET /api/workflows/[id]/runs error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

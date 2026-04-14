/**
 * /api/delegation
 *
 * GET — list active delegation mandates for the authenticated user's org.
 *       Used by the dashboard to show "what BitBit is currently managing".
 *
 * Auth: cookie-based (web) or bearer token (mobile), same pattern as
 * /api/agent/approvals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { listActiveMandatesForOrg } from '@/lib/agent/delegation-mandate'
import { logger } from '@/lib/core/logger'

async function resolveAuth(request: NextRequest) {
  const bearer = await authenticateBearer(request)
  if (bearer) {
    return { supabase: getServiceClient(), orgId: bearer.orgId, userId: bearer.user.id }
  }

  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Supabase not configured' }, { status: 500 }) }
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
    return { error: NextResponse.json({ error: 'No profile/org found for user' }, { status: 400 }) }
  }

  return { supabase, orgId: profile.org_id, userId: user.id }
}

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request)
  if ('error' in auth) return auth.error

  try {
    const mandates = await listActiveMandatesForOrg(auth.supabase, auth.orgId)
    return NextResponse.json({ mandates })
  } catch (err) {
    logger.warn('[api/delegation] GET failed', { error: err })
    return NextResponse.json({ error: 'Failed to list delegation mandates' }, { status: 500 })
  }
}

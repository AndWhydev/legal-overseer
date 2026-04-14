/**
 * /api/delegation/[entityId]
 *
 * DELETE — revoke the active delegation mandate for a specific entity.
 *          Returns { revoked: true } if a mandate was deactivated,
 *          { revoked: false } if the entity had no active mandate.
 *
 * Scope: the mandate must belong to the caller's org (enforced by RLS on the
 * delegation_mandates table; `revokeEntityMandate` also filters by org_id).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import { authenticateBearer } from '@/lib/supabase/bearer-auth'
import { revokeEntityMandate } from '@/lib/agent/delegation-mandate'
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const auth = await resolveAuth(request)
  if ('error' in auth) return auth.error

  const { entityId } = await params
  if (!entityId || entityId.trim() === '') {
    return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
  }

  try {
    const revoked = await revokeEntityMandate(auth.supabase, auth.orgId, entityId, 'dashboard')
    return NextResponse.json({ revoked })
  } catch (err) {
    logger.warn('[api/delegation/[entityId]] DELETE failed', { error: err, entityId })
    return NextResponse.json({ error: 'Failed to revoke mandate' }, { status: 500 })
  }
}

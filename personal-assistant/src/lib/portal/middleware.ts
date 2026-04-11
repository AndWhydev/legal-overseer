import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PortalAccess } from './types'

/**
 * Validate portal API request. Returns the portal access record or an error response.
 * Used by all /api/portal/* routes.
 */
export async function validatePortalRequest(): Promise<
  | { ok: true; access: PortalAccess; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: 'Not configured' }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Check for active portal access
  const { data: access } = await supabase
    .from('portal_access')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .single()

  if (!access) {
    return { ok: false, response: NextResponse.json({ error: 'No portal access' }, { status: 403 }) }
  }

  return { ok: true, access: access as PortalAccess, userId: user.id }
}

/**
 * Validate that the current user is an agency member with access to manage portal.
 * Used by agency-side portal management routes.
 */
export async function validateAgencyRequest(): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: 'Not configured' }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return { ok: false, response: NextResponse.json({ error: 'No org found' }, { status: 400 }) }
  }

  return { ok: true, userId: user.id, orgId: profile.org_id as string }
}

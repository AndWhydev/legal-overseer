import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface BearerAuth {
  user: { id: string; email?: string }
  orgId: string
  displayName?: string
}

/**
 * Authenticate via Bearer token in Authorization header.
 * Used by mobile clients that cannot use cookie-based auth.
 *
 * Returns null if no Bearer token present (allows fallback to cookie auth).
 * Throws Response if token present but invalid.
 */
export async function authenticateBearer(request: NextRequest): Promise<BearerAuth | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Response('Server misconfigured', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, display_name')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    throw new Response('No profile found', { status: 400 })
  }

  return {
    user: { id: user.id, email: user.email ?? undefined },
    orgId: profile.org_id,
    displayName: profile.display_name
      || user.user_metadata?.display_name
      || user.email?.split('@')[0],
  }
}

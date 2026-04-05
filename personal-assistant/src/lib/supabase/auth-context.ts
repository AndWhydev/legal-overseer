import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authenticateBearer } from './bearer-auth'
import { createClient } from './server'
import { getServiceClient } from './service-client'

export interface AuthContext {
  supabase: SupabaseClient
  userId: string
  email?: string
  orgId: string
  displayName?: string
}

/**
 * Authenticate a request via Bearer token (CLI/mobile) or cookies (web).
 * Returns null if unauthenticated. Throws Response on invalid Bearer token.
 */
export async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
  // Try Bearer token first (CLI and mobile clients)
  try {
    const bearer = await authenticateBearer(request)
    if (bearer) {
      return {
        supabase: getServiceClient(),
        userId: bearer.user.id,
        email: bearer.user.email,
        orgId: bearer.orgId,
        displayName: bearer.displayName,
      }
    }
  } catch (err) {
    if (err instanceof Response) throw err
    return null
  }

  // Fall back to cookie-based auth (web)
  const supabase = await createClient()
  if (!supabase) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, display_name')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) return null

  return {
    supabase,
    userId: user.id,
    email: user.email ?? undefined,
    orgId: profile.org_id,
    displayName: profile.display_name
      || user.user_metadata?.display_name
      || user.email?.split('@')[0],
  }
}

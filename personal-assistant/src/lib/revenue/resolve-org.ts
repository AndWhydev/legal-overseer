/**
 * Shared org resolution for revenue API routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveOrgId(
  supabase: SupabaseClient,
): Promise<{ orgId: string; userId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!data?.org_id) return null

  return { orgId: data.org_id, userId: user.id }
}

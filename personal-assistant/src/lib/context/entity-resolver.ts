import { createClient } from '@/lib/supabase/server'
import type { Contact } from '@/lib/types'

export async function resolveEntity(
  query: string,
  orgId: string
): Promise<Contact[]> {
  const supabase = await createClient()
  if (!supabase) return []

  const q = query.toLowerCase().trim()

  // Search across aliases (GIN index), emails (GIN index), phones (GIN index), name, and slug
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .or(`name.ilike.%${q}%,slug.ilike.%${q}%,aliases.cs.{${q}},emails.cs.{${q}},phones.cs.{${q}}`)

  if (error) {
    console.error('[entity-resolver] Error:', error.message)
    return []
  }

  return (data ?? []) as Contact[]
}

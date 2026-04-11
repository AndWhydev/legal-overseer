import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvedEntity {
  id: string
  name: string
  type: string
  confidence: number
  matchReason: string
}

export async function resolveEntity(
  supabase: SupabaseClient,
  orgId: string,
  query: string
): Promise<ResolvedEntity | null> {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) return null

  // 1. Exact alias match (highest confidence)
  const { data: aliasMatch } = await supabase
    .from('contacts')
    .select('id, name, type')
    .eq('org_id', orgId)
    .contains('aliases', [normalizedQuery])
    .limit(1)
    .single()

  if (aliasMatch) {
    return {
      id: aliasMatch.id,
      name: aliasMatch.name,
      type: aliasMatch.type,
      confidence: 1.0,
      matchReason: 'exact_alias'
    }
  }

  // 2. Exact email match
  const { data: emailMatch } = await supabase
    .from('contacts')
    .select('id, name, type')
    .eq('org_id', orgId)
    .contains('emails', [normalizedQuery])
    .limit(1)
    .single()

  if (emailMatch) {
    return {
      id: emailMatch.id,
      name: emailMatch.name,
      type: emailMatch.type,
      confidence: 1.0,
      matchReason: 'exact_email'
    }
  }

  // 3. Exact phone match (clean formatting)
  const cleanPhone = normalizedQuery.replace(/[^0-9+]/g, '')
  if (cleanPhone.length >= 8) {
    const { data: phoneMatch } = await supabase
      .from('contacts')
      .select('id, name, type')
      .eq('org_id', orgId)
      .contains('phones', [cleanPhone])
      .limit(1)
      .single()

    if (phoneMatch) {
      return {
        id: phoneMatch.id,
        name: phoneMatch.name,
        type: phoneMatch.type,
        confidence: 1.0,
        matchReason: 'exact_phone'
      }
    }
  }

  // 4. Exact name match
  const { data: exactNameMatch } = await supabase
    .from('contacts')
    .select('id, name, type')
    .eq('org_id', orgId)
    .ilike('name', normalizedQuery)
    .limit(1)
    .single()

  if (exactNameMatch) {
    return {
      id: exactNameMatch.id,
      name: exactNameMatch.name,
      type: exactNameMatch.type,
      confidence: 0.95,
      matchReason: 'exact_name'
    }
  }

  // 5. Partial name match (e.g. "Sezer" matching "Sezer Yunus")
  const { data: partialNameMatch } = await supabase
    .from('contacts')
    .select('id, name, type')
    .eq('org_id', orgId)
    .ilike('name', `%${normalizedQuery}%`)
    .limit(1)
    .single()

  if (partialNameMatch) {
    return {
      id: partialNameMatch.id,
      name: partialNameMatch.name,
      type: partialNameMatch.type,
      confidence: 0.75,
      matchReason: 'partial_name'
    }
  }

  return null
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Contact } from '@/lib/types'

export interface RankedContact {
  contact: Contact
  matchConfidence: number
  matchStep: string
}

/**
 * Normalize a phone number by stripping spaces, dashes, parens.
 * Also generates AU variant: 04xx -> +614xx
 */
function normalizePhone(raw: string): string[] {
  const stripped = raw.replace(/[\s\-\(\)\.]/g, '')
  const variants = [stripped]

  // AU mobile: 04xx -> +614xx
  if (stripped.startsWith('0') && stripped.length === 10) {
    variants.push('+61' + stripped.slice(1))
  }
  // Reverse: +614xx -> 04xx
  if (stripped.startsWith('+61') && stripped.length === 12) {
    variants.push('0' + stripped.slice(3))
  }

  return [...new Set(variants)]
}

async function stepAlias(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const q = query.toLowerCase().trim()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .contains('aliases', [q])

  if (error) return []
  return (data ?? []) as Contact[]
}

async function stepEmail(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const q = query.toLowerCase().trim()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .contains('emails', [q])

  if (error) return []
  return (data ?? []) as Contact[]
}

async function stepPhone(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const q = query.trim()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .contains('phones', [q])

  if (error) return []
  return (data ?? []) as Contact[]
}

async function stepName(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const q = query.toLowerCase().trim()
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('org_id', orgId)
    .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)

  if (error) return []
  return (data ?? []) as Contact[]
}

async function stepPhoneVariant(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const variants = normalizePhone(query)
  // Try each variant
  for (const variant of variants) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('org_id', orgId)
      .contains('phones', [variant])

    if (!error && data && data.length > 0) {
      return data as Contact[]
    }
  }
  return []
}

interface Step {
  name: string
  confidence: number
  fn: (supabase: SupabaseClient, query: string, orgId: string) => Promise<Contact[]>
}

const STEPS: Step[] = [
  { name: 'alias', confidence: 1.0, fn: stepAlias },
  { name: 'email', confidence: 0.95, fn: stepEmail },
  { name: 'phone', confidence: 0.90, fn: stepPhone },
  { name: 'name', confidence: 0.70, fn: stepName },
  { name: 'phone_variant', confidence: 0.60, fn: stepPhoneVariant },
]

/**
 * 5-step fuzzy entity resolution with ranked results.
 * Cascades through steps, stopping at the first that returns results.
 */
export async function resolveEntityRanked(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<RankedContact[]> {
  for (const step of STEPS) {
    const contacts = await step.fn(supabase, query, orgId)
    if (contacts.length > 0) {
      return contacts.map((contact) => ({
        contact,
        matchConfidence: step.confidence,
        matchStep: step.name,
      }))
    }
  }

  return []
}

/**
 * Backward-compatible entity resolution.
 * Returns Contact[] (no ranked metadata).
 */
export async function resolveEntity(
  supabase: SupabaseClient,
  query: string,
  orgId: string
): Promise<Contact[]> {
  const ranked = await resolveEntityRanked(supabase, query, orgId)
  return ranked.map((r) => r.contact)
}

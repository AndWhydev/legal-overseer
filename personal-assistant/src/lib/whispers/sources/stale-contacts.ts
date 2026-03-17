import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

export async function whisperStaleContacts(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Whisper[]> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, last_interaction_at, lead_score, type')
    .eq('org_id', orgId)
    .not('last_interaction_at', 'is', null)
    .lt('last_interaction_at', threeDaysAgo)
    .in('type', ['client', 'business', 'vendor'])
    .order('last_interaction_at', { ascending: true })
    .limit(5)

  if (error || !data?.length) return []

  const now = Date.now()

  return data.map((contact) => {
    const lastAt = new Date(contact.last_interaction_at).getTime()
    const daysSince = Math.floor((now - lastAt) / (24 * 60 * 60 * 1000))

    // Score: more days = higher urgency, hot leads score higher
    const leadMultiplier = contact.lead_score === 'hot' ? 1.0 : contact.lead_score === 'warm' ? 0.8 : 0.5
    const urgency = Math.min(1, daysSince / 14) // caps at 14 days
    const score = urgency * leadMultiplier

    return {
      text: `${contact.name} hasn't replied in ${daysSince} day${daysSince !== 1 ? 's' : ''}`,
      score,
      source: 'stale_contacts',
      context: {
        contactId: contact.id,
        contactName: contact.name,
        daysSince,
        leadScore: contact.lead_score,
      },
    }
  })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

function truncateWhisper(text: string, max = 45): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf(' ', max - 3)
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 3)) + '...'
}

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

    const prompt = contact.lead_score === 'hot' ? 'Reach out to' : 'Follow up with'

    return {
      text: truncateWhisper(`${prompt} ${contact.name}? ${daysSince} days`),
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

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommunicationTone = 'formal' | 'professional' | 'casual' | 'friendly'
export type PreferredChannel = 'email' | 'whatsapp' | 'sms' | 'phone'
export type CommunicationFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'as_needed'

export interface ClientProfile {
  contactSlug: string
  preferredChannel: PreferredChannel
  tone: CommunicationTone
  frequency: CommunicationFrequency
  timezone: string
  bestContactHours?: { start: string; end: string }
  statusUpdateDay?: number // 0=Sun, 1=Mon, etc.
  notes?: string
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get client communication profile from contact metadata.
 * Stored in contacts.communication_patterns JSONB field.
 */
export async function getClientProfile(
  supabase: SupabaseClient,
  orgId: string,
  contactSlug: string,
): Promise<ClientProfile | null> {
  const { data } = await supabase
    .from('contacts')
    .select('slug, communication_patterns')
    .eq('org_id', orgId)
    .eq('slug', contactSlug)
    .single()

  if (!data?.communication_patterns) return null

  const cp = data.communication_patterns as Record<string, unknown>

  return {
    contactSlug: data.slug,
    preferredChannel: (cp.preferred_channel as PreferredChannel) || 'email',
    tone: (cp.tone as CommunicationTone) || 'professional',
    frequency: (cp.frequency as CommunicationFrequency) || 'weekly',
    timezone: (cp.timezone as string) || 'Australia/Sydney',
    bestContactHours: cp.best_contact_hours as ClientProfile['bestContactHours'],
    statusUpdateDay: cp.status_update_day as number | undefined,
    notes: cp.notes as string | undefined,
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Update client communication profile.
 * Merges into existing communication_patterns on the contact.
 */
export async function updateClientProfile(
  supabase: SupabaseClient,
  orgId: string,
  contactSlug: string,
  updates: Partial<Omit<ClientProfile, 'contactSlug'>>,
): Promise<ClientProfile | null> {
  // Fetch current patterns
  const { data: existing } = await supabase
    .from('contacts')
    .select('communication_patterns')
    .eq('org_id', orgId)
    .eq('slug', contactSlug)
    .single()

  const current = (existing?.communication_patterns || {}) as Record<string, unknown>

  const merged: Record<string, unknown> = {
    ...current,
    ...(updates.preferredChannel !== undefined && { preferred_channel: updates.preferredChannel }),
    ...(updates.tone !== undefined && { tone: updates.tone }),
    ...(updates.frequency !== undefined && { frequency: updates.frequency }),
    ...(updates.timezone !== undefined && { timezone: updates.timezone }),
    ...(updates.bestContactHours !== undefined && { best_contact_hours: updates.bestContactHours }),
    ...(updates.statusUpdateDay !== undefined && { status_update_day: updates.statusUpdateDay }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
  }

  const { error } = await supabase
    .from('contacts')
    .update({ communication_patterns: merged })
    .eq('org_id', orgId)
    .eq('slug', contactSlug)

  if (error) {
    logger.warn('[client-profiles] Failed to update profile:', error.message)
    return null
  }

  return getClientProfile(supabase, orgId, contactSlug)
}

// ---------------------------------------------------------------------------
// List contacts due for status update
// ---------------------------------------------------------------------------

/**
 * Find contacts whose configured status update day matches today.
 */
export async function getContactsDueForStatusUpdate(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const today = new Date().getDay() // 0=Sun

  const { data: contacts } = await supabase
    .from('contacts')
    .select('slug, communication_patterns')
    .eq('org_id', orgId)
    .eq('type', 'client')

  if (!contacts) return []

  return contacts
    .filter(c => {
      const cp = c.communication_patterns as Record<string, unknown> | null
      if (!cp) return false
      const updateDay = cp.status_update_day as number | undefined
      // Default to Friday (5) if frequency is weekly but no day set
      const frequency = cp.frequency as string | undefined
      if (frequency === 'weekly' && updateDay === undefined) {
        return today === 5
      }
      return updateDay === today
    })
    .map(c => c.slug)
}

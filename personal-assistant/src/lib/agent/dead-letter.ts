import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Dead letter queue for permanently failed agent actions.
 *
 * When an agent action fails after all retries, store in
 * `dead_letter_queue` table for manual review / replay.
 */

export interface DeadLetterEntry {
  id?: string
  agent_type: string
  org_id: string
  error_message: string
  error_stack?: string | null
  payload: Record<string, unknown>
  agent_config_id?: string | null
  agent_run_id?: string | null
  created_at?: string
  resolved_at?: string | null
}

/**
 * Insert a failed action into the dead letter queue.
 * Never throws -- dead-lettering should not break caller flow.
 */
export async function deadLetter(
  supabase: SupabaseClient,
  entry: Omit<DeadLetterEntry, 'id' | 'created_at'>,
): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('dead_letter_queue')
      .insert({
        agent_type: entry.agent_type,
        org_id: entry.org_id,
        error_message: entry.error_message,
        error_stack: entry.error_stack ?? null,
        payload: entry.payload,
        agent_config_id: entry.agent_config_id ?? null,
        agent_run_id: entry.agent_run_id ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[dead-letter] Failed to insert:', error.message)
      return null
    }

    return { id: data.id }
  } catch (err) {
    console.error('[dead-letter] Unexpected error:', err)
    return null
  }
}

/**
 * Fetch unresolved dead letter entries for an org.
 */
export async function getUnresolvedDeadLetters(
  supabase: SupabaseClient,
  orgId: string,
  limit = 50,
): Promise<DeadLetterEntry[]> {
  try {
    const { data, error } = await supabase
      .from('dead_letter_queue')
      .select('*')
      .eq('org_id', orgId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('[dead-letter] Failed to fetch:', error.message)
      return []
    }

    return (data ?? []) as DeadLetterEntry[]
  } catch (err) {
    console.warn('[dead-letter] Unexpected error fetching:', err)
    return []
  }
}

/**
 * Mark a dead letter entry as resolved.
 */
export async function resolveDeadLetter(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('dead_letter_queue')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.warn('[dead-letter] Failed to resolve:', error.message)
      return false
    }

    return true
  } catch {
    return false
  }
}

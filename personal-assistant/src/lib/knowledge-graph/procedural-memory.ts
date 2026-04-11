import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export interface ProceduralMemory {
  id: string
  org_id: string
  name: string
  trigger_pattern: string
  steps: string[]
  success_count: number
  last_used_at: string | null
  source: 'observed' | 'explicit' | 'consolidation'
  is_active: boolean
}

/**
 * Match a user message against stored procedural memories using regex trigger patterns.
 * Returns the first matching procedure, or null if none match.
 */
export async function matchProcedure(
  supabase: SupabaseClient,
  orgId: string,
  message: string,
): Promise<ProceduralMemory | null> {
  try {
    const { data: procedures, error } = await supabase
      .from('procedural_memories')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)

    if (error) {
      logger.warn('[procedural-memory] matchProcedure query failed:', error.message)
      return null
    }

    if (!procedures?.length) return null

    for (const proc of procedures) {
      try {
        const regex = new RegExp(proc.trigger_pattern, 'i')
        if (regex.test(message)) {
          return proc as ProceduralMemory
        }
      } catch {
        // Invalid regex pattern stored — skip silently
        logger.debug('[procedural-memory] Invalid trigger_pattern regex:', proc.trigger_pattern)
      }
    }

    return null
  } catch (err) {
    logger.warn('[procedural-memory] matchProcedure failed:', err)
    return null
  }
}

/**
 * Create a new procedural memory (learned workflow).
 */
export async function createProcedure(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  triggerPattern: string,
  steps: string[],
  source: 'observed' | 'explicit' | 'consolidation' = 'explicit',
): Promise<ProceduralMemory | null> {
  try {
    const { data, error } = await supabase
      .from('procedural_memories')
      .insert({
        org_id: orgId,
        name,
        trigger_pattern: triggerPattern,
        steps,
        source,
      })
      .select()
      .single()

    if (error) {
      logger.warn('[procedural-memory] createProcedure failed:', error.message)
      return null
    }

    return data as ProceduralMemory
  } catch (err) {
    logger.warn('[procedural-memory] createProcedure failed:', err)
    return null
  }
}

/**
 * Increment the success_count and update last_used_at for a procedure.
 * Uses read-then-write (acceptable for low-contention procedural memories).
 */
export async function incrementSuccess(
  supabase: SupabaseClient,
  procedureId: string,
): Promise<void> {
  try {
    const { data: current, error: readError } = await supabase
      .from('procedural_memories')
      .select('success_count')
      .eq('id', procedureId)
      .single()

    if (readError || !current) {
      logger.warn('[procedural-memory] incrementSuccess read failed:', readError?.message)
      return
    }

    const { error: updateError } = await supabase
      .from('procedural_memories')
      .update({
        success_count: (current.success_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', procedureId)

    if (updateError) {
      logger.warn('[procedural-memory] incrementSuccess update failed:', updateError.message)
    }
  } catch (err) {
    logger.warn('[procedural-memory] incrementSuccess failed:', err)
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

interface DLQEntry {
  orgId: string
  agentType: string
  agentConfigId?: string
  agentRunId?: string
  errorMessage: string
  errorStack?: string
  payload?: Record<string, unknown>
}

export async function writeToDeadLetterQueue(
  supabase: SupabaseClient,
  entry: DLQEntry
): Promise<void> {
  try {
    const { error } = await supabase.from('dead_letter_queue').insert({
      org_id: entry.orgId,
      agent_type: entry.agentType,
      agent_config_id: entry.agentConfigId ?? null,
      agent_run_id: entry.agentRunId ?? null,
      error_message: entry.errorMessage.slice(0, 10000),
      error_stack: entry.errorStack?.slice(0, 50000) ?? null,
      payload: entry.payload ?? null,
    })
    if (error) {
      logger.error('[dlq] Failed to write to dead letter queue', error.message)
    }
  } catch (err) {
    logger.error('[dlq] DLQ write exception', err)
  }
}

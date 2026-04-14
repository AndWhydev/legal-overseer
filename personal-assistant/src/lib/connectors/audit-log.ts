/**
 * Typed audit log helper for ConnectorLifecycle operations.
 *
 * Lifecycle ops (provision / activate / refresh / suspend / disconnect
 * / health_check / refresh_token) write a row here so operators can
 * reconstruct what happened to a connection from a single query. We
 * reuse the existing `connection_sync_logs` table — previously only
 * poll syncs wrote to it — and overload the `error_message` column
 * with a prefixed tag (`op:disconnect`, `op:activate`, …) until a
 * follow-up migration adds a typed `op` column.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../core/logger'

export type LifecycleOp =
  | 'provision'
  | 'activate'
  | 'refresh'
  | 'suspend'
  | 'disconnect'
  | 'health_check'

export interface AuditLogInput {
  connectionId: string
  op: LifecycleOp
  status: 'success' | 'error' | 'partial'
  note?: string
  durationMs?: number
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  input: AuditLogInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('connection_sync_logs').insert({
      connection_id: input.connectionId,
      status: input.status,
      messages_found: 0,
      messages_inserted: 0,
      duplicates: 0,
      error_message: `op:${input.op}${input.note ? ` — ${input.note}` : ''}`,
      duration_ms: input.durationMs ?? null,
    })
    if (error) {
      logger.warn('[audit-log] write failed', {
        connectionId: input.connectionId,
        op: input.op,
        error: error.message,
      })
    }
  } catch (err) {
    logger.warn('[audit-log] write threw', {
      connectionId: input.connectionId,
      op: input.op,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

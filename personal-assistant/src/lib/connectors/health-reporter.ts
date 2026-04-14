/**
 * ConnectionHealthReporter — the single writer for connection health
 * state on org_connections.
 *
 * Having one writer avoids split-brain between:
 *   - bridge-lifecycle crons that directly update status
 *   - connector-health cron calling ConnectorLifecycle.healthCheck
 *   - user actions via the disconnect/refresh routes
 *
 * Every successful probe resets `consecutive_failures`; every failure
 * increments it and (after a threshold) flips `status` to 'error' or
 * 'auth_expired'. All writes also bump `last_health_at`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConnectionStatus } from '../connections/types'
import { logger } from '../core/logger'

export interface HealthReportInput {
  connectionId: string
  healthy: boolean
  nextStatus?: ConnectionStatus
  error?: string
  authExpiresAt?: string | null
  /** Number of consecutive failures before we escalate to 'error' status. */
  failureThreshold?: number
}

export class ConnectionHealthReporter {
  constructor(private supabase: SupabaseClient) {}

  async report(input: HealthReportInput): Promise<void> {
    const now = new Date().toISOString()
    const threshold = input.failureThreshold ?? 3

    // Fetch current streak so we can increment atomically-ish.
    const { data: current } = await this.supabase
      .from('org_connections')
      .select('consecutive_failures, status')
      .eq('id', input.connectionId)
      .single()

    const currentFailures = (current?.consecutive_failures as number | undefined) ?? 0

    const updates: Record<string, unknown> = {
      last_health_at: now,
      updated_at: now,
    }

    if (input.authExpiresAt !== undefined) {
      updates.auth_expires_at = input.authExpiresAt
    }

    if (input.healthy) {
      updates.consecutive_failures = 0
      updates.last_error = null
      // Only flip status to 'connected' if we were in a recoverable failure
      // state — don't stomp 'suspended' or 'disabled'.
      const recoverable: ConnectionStatus[] = ['error', 'auth_expired', 'needs_reauth']
      if (current?.status && recoverable.includes(current.status as ConnectionStatus)) {
        updates.status = 'connected'
      }
      if (input.nextStatus) updates.status = input.nextStatus
    } else {
      const newFailures = currentFailures + 1
      updates.consecutive_failures = newFailures
      if (input.error) updates.last_error = input.error

      // Escalate to error status after threshold (or immediately for
      // auth-specific failures the lifecycle surfaced).
      if (input.nextStatus) {
        updates.status = input.nextStatus
      } else if (newFailures >= threshold && current?.status === 'connected') {
        updates.status = 'error'
      }
    }

    const { error } = await this.supabase
      .from('org_connections')
      .update(updates)
      .eq('id', input.connectionId)

    if (error) {
      logger.error('[health-reporter] failed to write report', {
        connectionId: input.connectionId,
        error: error.message,
      })
    }
  }

  /**
   * Record a hard status override (used by lifecycle operations themselves,
   * e.g. after provision() → 'provisioning', or disconnect() → 'disabled').
   * Doesn't touch `consecutive_failures`.
   */
  async setStatus(
    connectionId: string,
    status: ConnectionStatus,
    opts?: { error?: string | null; authExpiresAt?: string | null },
  ): Promise<void> {
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      status,
      updated_at: now,
    }
    if (opts?.error !== undefined) updates.last_error = opts.error
    if (opts?.authExpiresAt !== undefined) updates.auth_expires_at = opts.authExpiresAt

    const { error } = await this.supabase
      .from('org_connections')
      .update(updates)
      .eq('id', connectionId)

    if (error) {
      logger.error('[health-reporter] setStatus failed', {
        connectionId,
        status,
        error: error.message,
      })
    }
  }
}

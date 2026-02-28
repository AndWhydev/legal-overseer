import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActorType = 'user' | 'agent' | 'system' | 'cron'

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'escalated'
  | 'executed'

export type EntityType =
  | 'invoice'
  | 'lead'
  | 'approval'
  | 'contact'
  | 'task'
  | 'message'
  | 'proposal'
  | 'tender'
  | 'watch'
  | 'credential'

export interface AuditEvent {
  orgId: string
  actorType: ActorType
  actorId: string
  action: AuditAction
  entityType: EntityType
  entityId: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Insert a structured audit log entry. Fire-and-forget safe --
 * errors are logged to console but never thrown so callers are
 * not disrupted by audit failures.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  event: AuditEvent,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    org_id: event.orgId,
    actor_type: event.actorType,
    actor_id: event.actorId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    metadata: event.metadata ?? {},
    ip_address: event.ipAddress ?? null,
  })

  if (error) {
    console.error('[audit] Failed to write audit log:', error.message, {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
    })
  }
}

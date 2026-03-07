import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntityRef, RelationshipType } from './types'
import { logger } from '@/lib/core/logger';

/**
 * Upsert an entity relationship. On conflict (same org + entities + type),
 * updates last_evidence_at. Uses standard Supabase upsert for compatibility.
 * Fire-and-forget: logs errors but never throws.
 */
export async function linkRelationship(
  supabase: SupabaseClient,
  orgId: string,
  entityA: EntityRef,
  entityB: EntityRef,
  relType: RelationshipType,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from('entity_relationships')
      .upsert(
        {
          org_id: orgId,
          entity_a_type: entityA.type,
          entity_a_id: entityA.id,
          entity_b_type: entityB.type,
          entity_b_id: entityB.id,
          relationship_type: relType,
          strength: 1.0,
          metadata: metadata ?? {},
          last_evidence_at: new Date().toISOString(),
        },
        {
          onConflict: 'org_id,entity_a_type,entity_a_id,entity_b_type,entity_b_id,relationship_type',
        }
      )

    if (error) {
      logger.error('[relationship-linker] Failed to link relationship:', error.message)
    }
  } catch (err) {
    logger.error('[relationship-linker] Unexpected error:', err)
  }
}

/** Link a task to a contact via 'assigned_to' relationship */
export async function linkTaskToContact(
  supabase: SupabaseClient,
  orgId: string,
  taskId: string,
  contactId: string
): Promise<void> {
  return linkRelationship(
    supabase,
    orgId,
    { type: 'task', id: taskId },
    { type: 'contact', id: contactId },
    'assigned_to'
  )
}

/** Link an invoice to a contact via 'bills_for' relationship */
export async function linkInvoiceToContact(
  supabase: SupabaseClient,
  orgId: string,
  invoiceId: string,
  contactId: string
): Promise<void> {
  return linkRelationship(
    supabase,
    orgId,
    { type: 'invoice', id: invoiceId },
    { type: 'contact', id: contactId },
    'bills_for'
  )
}

/** Link a task to a goal via 'part_of' relationship */
export async function linkTaskToGoal(
  supabase: SupabaseClient,
  orgId: string,
  taskId: string,
  goalId: string
): Promise<void> {
  return linkRelationship(
    supabase,
    orgId,
    { type: 'task', id: taskId },
    { type: 'goal', id: goalId },
    'part_of'
  )
}

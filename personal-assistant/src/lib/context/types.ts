// Shared types for semantic context engine
// Must match CHECK constraints in 005_entity_relationships.sql and 006_entity_timeline.sql

export type EntityType = 'contact' | 'task' | 'invoice' | 'project' | 'channel_message' | 'goal'

export type RelationshipType =
  | 'works_on'
  | 'bills_for'
  | 'assigned_to'
  | 'mentioned_in'
  | 'related_to'
  | 'manages'
  | 'created_by'
  | 'client_of'
  | 'vendor_for'
  | 'part_of'

export type TimelineEventType =
  | 'message_received'
  | 'message_sent'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'status_changed'
  | 'mention'
  | 'note_added'
  | 'relationship_created'
  | 'contact_created'
  | 'contact_updated'

export interface EntityRef {
  type: EntityType
  id: string
}

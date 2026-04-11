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

// Context assembler types

export interface RelationshipEdge {
  entityType: EntityType
  entityId: string
  relationshipType: RelationshipType
  strength: number
  metadata: Record<string, unknown>
  lastEvidenceAt: string
}

export interface TimelineEntry {
  id: string
  eventType: TimelineEventType
  eventData: Record<string, unknown>
  occurredAt: string
  channelSource: string | null
}

export interface MemoryEntry {
  id: string
  category: string
  content: string
  confidence: number
  entityIds: string[]
}

export interface ResolvedEntity {
  type: EntityType
  id: string
  name: string
  matchConfidence: number
  matchStep: string
}

export interface EntityBriefing {
  entity: EntityRef
  relationships: RelationshipEdge[]
  timeline: TimelineEntry[]
  memories: MemoryEntry[]
  crossReferences: CrossReference
}

export interface ContextBriefing {
  resolvedEntities: ResolvedEntity[]
  briefings: EntityBriefing[]
  summary: string
}

// Cross-reference types

export interface TaskRef {
  id: string
  title: string
  status: string
  priority: string
  targetDate: string | null
}

export interface Deadline {
  taskId: string
  title: string
  targetDate: string
  daysUntil: number
}

export interface FinancialSignal {
  totalOutstanding: number
  overdueCount: number
  lastPaymentDate: string | null
  invoiceCount: number
}

export interface WaitingFor {
  taskId: string
  title: string
  status: string
  assignedTo: string | null
}

export interface CrossReference {
  relatedTasks: TaskRef[]
  deadlines: Deadline[]
  financialSignals: FinancialSignal
  waitingFor: WaitingFor[]
}

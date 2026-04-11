import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEntityRanked } from './entity-resolver'
import type {
  EntityType,
  EntityBriefing,
  ContextBriefing,
  RelationshipEdge,
  TimelineEntry,
  MemoryEntry,
  ResolvedEntity,
  CrossReference,
  TaskRef,
  Deadline,
  WaitingFor,
} from './types'

/**
 * Assemble a full briefing for a single entity: relationships, timeline, and memories.
 */
export async function assembleEntityBriefing(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  options?: { maxTimelineEvents?: number; maxMemories?: number }
): Promise<EntityBriefing> {
  const maxTimeline = options?.maxTimelineEvents ?? 15
  const maxMemories = options?.maxMemories ?? 10

  const [relRes, timelineRes, memoriesRes, crossReferences] = await Promise.all([
    supabase
      .from('entity_relationships')
      .select('*')
      .eq('org_id', orgId)
      .or(
        `and(entity_a_type.eq.${entityType},entity_a_id.eq.${entityId}),and(entity_b_type.eq.${entityType},entity_b_id.eq.${entityId})`
      )
      .order('strength', { ascending: false })
      .limit(20),
    supabase
      .from('entity_timeline')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false })
      .limit(maxTimeline),
    supabase
      .from('semantic_memories')
      .select('*')
      .eq('org_id', orgId)
      .contains('entity_ids', [entityId])
      .eq('is_active', true)
      .order('confidence', { ascending: false })
      .limit(maxMemories),
    loadCrossReferences(supabase, orgId, entityType, entityId),
  ])

  const relationships: RelationshipEdge[] = (relRes.data ?? []).map((r: Record<string, unknown>) => {
    // Return the "other" side of the relationship
    const isA = r.entity_a_type === entityType && r.entity_a_id === entityId
    return {
      entityType: (isA ? r.entity_b_type : r.entity_a_type) as EntityType,
      entityId: (isA ? r.entity_b_id : r.entity_a_id) as string,
      relationshipType: r.relationship_type as RelationshipEdge['relationshipType'],
      strength: r.strength as number,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      lastEvidenceAt: r.last_evidence_at as string,
    }
  })

  const timeline: TimelineEntry[] = (timelineRes.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    eventType: t.event_type as TimelineEntry['eventType'],
    eventData: (t.event_data ?? {}) as Record<string, unknown>,
    occurredAt: t.occurred_at as string,
    channelSource: (t.channel_source ?? null) as string | null,
  }))

  const memories: MemoryEntry[] = (memoriesRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    category: m.category as string,
    content: m.content as string,
    confidence: m.confidence as number,
    entityIds: (m.entity_ids ?? []) as string[],
  }))

  return {
    entity: { type: entityType, id: entityId },
    relationships,
    timeline,
    memories,
    crossReferences,
  }
}

async function loadCrossReferences(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string
): Promise<CrossReference> {
  const empty: CrossReference = {
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: []
  }
  if (entityType === 'task') return loadTaskCrossReferences(supabase, orgId, entityId)
  if (entityType === 'goal') return loadGoalCrossReferences(supabase, orgId, entityId)
  if (entityType !== 'contact') return empty

  // 1. Fetch Invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total, due_date, paid_date')
    .eq('org_id', orgId)
    .eq('client_contact_id', entityId)

  let totalOutstanding = 0
  let overdueCount = 0
  let invoiceCount = 0
  let lastPaymentDate: string | null = null

  if (invoices) {
    invoiceCount = invoices.length
    for (const inv of invoices) {
      if (inv.status === 'sent' || inv.status === 'viewed') {
        totalOutstanding += Number(inv.total)
      } else if (inv.status === 'overdue') {
        totalOutstanding += Number(inv.total)
        overdueCount++
      } else if (inv.status === 'paid') {
        if (!lastPaymentDate || new Date(inv.paid_date) > new Date(lastPaymentDate)) {
          lastPaymentDate = inv.paid_date
        }
      }
    }
  }

  // 2. Fetch Tasks via relationships
  const { data: taskRels } = await supabase
    .from('entity_relationships')
    .select('entity_a_id')
    .eq('org_id', orgId)
    .eq('entity_b_id', entityId)
    .eq('entity_a_type', 'task')
    .eq('relationship_type', 'assigned_to')

  const taskIds = (taskRels ?? []).map((r: any) => r.entity_a_id)

  const relatedTasks: TaskRef[] = []
  const deadlines: Deadline[] = []
  const waitingFor: WaitingFor[] = []

  if (taskIds.length > 0) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, priority, metadata')
      .eq('org_id', orgId)
      .in('id', taskIds)

    if (tasks) {
      for (const t of tasks) {
        const targetDate = t.metadata?.target_date ?? null
        relatedTasks.push({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          targetDate
        })

        if (t.status === 'pending' || t.status === 'in_progress') {
          if (targetDate) {
            const daysUntil = Math.ceil((new Date(targetDate).getTime() - new Date().getTime()) / 86400000)
            deadlines.push({ taskId: t.id, title: t.title, targetDate, daysUntil })
          }
        }
        if (t.status === 'blocked' || t.metadata?.waiting_on) {
          waitingFor.push({ taskId: t.id, title: t.title, status: t.status, assignedTo: null })
        }
      }
    }
  }

  return { relatedTasks, deadlines, financialSignals: { totalOutstanding, overdueCount, lastPaymentDate, invoiceCount }, waitingFor }
}

async function loadTaskCrossReferences(
  supabase: SupabaseClient,
  orgId: string,
  taskId: string,
): Promise<CrossReference> {
  const empty: CrossReference = {
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: [],
  }

  // Find linked contacts for this task
  const { data: contactRels } = await supabase
    .from('entity_relationships')
    .select('entity_b_id')
    .eq('org_id', orgId)
    .eq('entity_a_id', taskId)
    .eq('entity_a_type', 'task')
    .eq('entity_b_type', 'contact')

  // Find related tasks (same contact or same goal)
  const contactIds = (contactRels ?? []).map((r: Record<string, unknown>) => r.entity_b_id as string)
  if (contactIds.length > 0) {
    const { data: siblingRels } = await supabase
      .from('entity_relationships')
      .select('entity_a_id')
      .eq('org_id', orgId)
      .eq('entity_a_type', 'task')
      .in('entity_b_id', contactIds)
      .neq('entity_a_id', taskId)
      .limit(10)

    const siblingIds = (siblingRels ?? []).map((r: Record<string, unknown>) => r.entity_a_id as string)
    if (siblingIds.length > 0) {
      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, title, status, priority, metadata')
        .eq('org_id', orgId)
        .in('id', siblingIds)

      if (siblings) {
        for (const t of siblings) {
          empty.relatedTasks.push({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            targetDate: t.metadata?.target_date ?? null,
          })
        }
      }
    }
  }

  return empty
}

async function loadGoalCrossReferences(
  supabase: SupabaseClient,
  orgId: string,
  goalId: string,
): Promise<CrossReference> {
  const empty: CrossReference = {
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: [],
  }

  // Find tasks linked to this goal
  const { data: taskRels } = await supabase
    .from('entity_relationships')
    .select('entity_a_id')
    .eq('org_id', orgId)
    .eq('entity_b_id', goalId)
    .eq('entity_b_type', 'goal')
    .eq('entity_a_type', 'task')

  const taskIds = (taskRels ?? []).map((r: Record<string, unknown>) => r.entity_a_id as string)
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, status, priority, metadata')
      .eq('org_id', orgId)
      .in('id', taskIds)

    if (tasks) {
      for (const t of tasks) {
        const targetDate = t.metadata?.target_date ?? null
        empty.relatedTasks.push({ id: t.id, title: t.title, status: t.status, priority: t.priority, targetDate })
        if ((t.status === 'pending' || t.status === 'in_progress') && targetDate) {
          const daysUntil = Math.ceil((new Date(targetDate).getTime() - Date.now()) / 86400000)
          empty.deadlines.push({ taskId: t.id, title: t.title, targetDate, daysUntil })
        }
      }
    }
  }

  return empty
}

/**
 * Format an entity briefing into a plain-text summary, budgeted to ~2000 chars.
 */
function formatBriefingSummary(briefing: EntityBriefing, entityName: string): string {
  const lines: string[] = []
  lines.push(`**${entityName}** (${briefing.entity.type})`)

  if (briefing.relationships.length > 0) {
    lines.push('Relationships:')
    for (const rel of briefing.relationships.slice(0, 5)) {
      lines.push(`  - ${rel.relationshipType} -> ${rel.entityType}:${rel.entityId.slice(0, 8)}`)
    }
  }

  if (briefing.timeline.length > 0) {
    lines.push('Recent events:')
    for (const ev of briefing.timeline.slice(0, 5)) {
      const date = new Date(ev.occurredAt).toLocaleDateString('en-AU')
      lines.push(`  - ${date}: ${ev.eventType}`)
    }
  }

  if (briefing.memories.length > 0) {
    lines.push('Memories:')
    for (const mem of briefing.memories.slice(0, 3)) {
      lines.push(`  - ${mem.content.slice(0, 100)}`)
    }
  }

  // Cross References (Financial & Operational Signals)
  const cross = briefing.crossReferences
  const signals: string[] = []

  if (cross.financialSignals.invoiceCount > 0) {
    if (cross.financialSignals.totalOutstanding > 0) {
      signals.push(`Outstanding Invoices: $${cross.financialSignals.totalOutstanding} (${cross.financialSignals.overdueCount} overdue)`)
    } else {
      signals.push(`All invoices paid (last: ${cross.financialSignals.lastPaymentDate ? new Date(cross.financialSignals.lastPaymentDate).toLocaleDateString() : 'N/A'})`)
    }
  }

  if (cross.relatedTasks.length > 0) {
    const activeTasks = cross.relatedTasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
    signals.push(`Active Tasks: ${activeTasks.length}`)
  }

  if (cross.deadlines.length > 0) {
    signals.push(`Deadlines: ${cross.deadlines.map(d => `${d.title} (in ${d.daysUntil} days)`).join(', ')}`)
  }

  if (signals.length > 0) {
    lines.push('Operational Signals:')
    for (const sig of signals) {
      lines.push(`  - ${sig}`)
    }
  }

  const result = lines.join('\n')
  return result.length > 2000 ? result.slice(0, 1997) + '...' : result
}

/**
 * Assemble context for a user query: resolve entities and build briefings.
 */
export async function assembleContext(
  supabase: SupabaseClient,
  orgId: string,
  query: string
): Promise<ContextBriefing> {
  const empty: ContextBriefing = { resolvedEntities: [], briefings: [], summary: '' }

  // Extract potential entity mentions (words with 2+ chars, skip common words)
  const words = query.split(/\s+/).filter(w => w.length >= 2)
  const stopWords = new Set(['the', 'for', 'and', 'with', 'about', 'what', 'how', 'can', 'you', 'please', 'tell', 'show', 'get', 'find'])

  const candidates = words.filter(w => !stopWords.has(w.toLowerCase()))
  if (candidates.length === 0) return empty

  // Try resolving each candidate, collect unique matches
  const resolvedEntities: ResolvedEntity[] = []
  const seenIds = new Set<string>()

  // 1. Resolve contacts (existing 5-step ranked resolver)
  for (const candidate of candidates) {
    if (resolvedEntities.length >= 3) break
    const ranked = await resolveEntityRanked(supabase, candidate, orgId)
    for (const match of ranked) {
      if (!seenIds.has(match.contact.id)) {
        seenIds.add(match.contact.id)
        resolvedEntities.push({
          type: 'contact',
          id: match.contact.id,
          name: match.contact.name,
          matchConfidence: match.matchConfidence,
          matchStep: match.matchStep,
        })
      }
    }
  }

  // 2. Resolve tasks by title match (if contacts didn't consume all slots)
  if (resolvedEntities.length < 3 && candidates.length > 0) {
    const searchPhrase = candidates.join(' ')
    const { data: matchedTasks } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('org_id', orgId)
      .neq('status', 'archived')
      .ilike('title', `%${searchPhrase}%`)
      .limit(2)

    for (const task of matchedTasks ?? []) {
      if (resolvedEntities.length >= 3) break
      if (!seenIds.has(task.id)) {
        seenIds.add(task.id)
        resolvedEntities.push({
          type: 'task',
          id: task.id,
          name: task.title,
          matchConfidence: 0.7,
          matchStep: 'task_title_match',
        })
      }
    }
  }

  // 3. Resolve goals by description match
  if (resolvedEntities.length < 3 && candidates.length > 0) {
    const searchPhrase = candidates.join(' ')
    const { data: matchedGoals } = await supabase
      .from('goals')
      .select('id, description')
      .eq('org_id', orgId)
      .in('status', ['active', 'blocked'])
      .ilike('description', `%${searchPhrase}%`)
      .limit(1)

    for (const goal of matchedGoals ?? []) {
      if (resolvedEntities.length >= 3) break
      if (!seenIds.has(goal.id)) {
        seenIds.add(goal.id)
        resolvedEntities.push({
          type: 'goal',
          id: goal.id,
          name: goal.description,
          matchConfidence: 0.6,
          matchStep: 'goal_description_match',
        })
      }
    }
  }

  if (resolvedEntities.length === 0) return empty

  // Build briefings for each resolved entity
  const briefings: EntityBriefing[] = await Promise.all(
    resolvedEntities.slice(0, 3).map(e =>
      assembleEntityBriefing(supabase, orgId, e.type, e.id)
    )
  )

  // Build summary text
  const summaryParts = resolvedEntities.slice(0, 3).map((entity, i) =>
    formatBriefingSummary(briefings[i], entity.name)
  )
  const summary = summaryParts.join('\n\n')

  return { resolvedEntities, briefings, summary }
}

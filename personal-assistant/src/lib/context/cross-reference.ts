import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EntityType,
  CrossReference,
  TaskRef,
  Deadline,
  FinancialSignal,
  WaitingFor,
} from './types'
import { getCachedCrossRefs, setCachedCrossRefs } from './xref-cache'

/**
 * Get tasks related to a contact via entity_relationships.
 */
export async function getRelatedTasks(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<TaskRef[]> {
  // Check cache first
  const cached = await getCachedCrossRefs(supabase, orgId, 'contact', contactId, 'tasks')
  if (cached) {
    return (cached.tasks as TaskRef[]) || []
  }

  // Find task IDs linked to this contact
  const { data: rels, error: relError } = await supabase
    .from('entity_relationships')
    .select('entity_a_type, entity_a_id, entity_b_type, entity_b_id')
    .eq('org_id', orgId)
    .or(
      `and(entity_a_type.eq.contact,entity_a_id.eq.${contactId},entity_b_type.eq.task),and(entity_b_type.eq.contact,entity_b_id.eq.${contactId},entity_a_type.eq.task)`
    )

  if (relError || !rels || rels.length === 0) return []

  const taskIds = rels.map((r: Record<string, unknown>) =>
    r.entity_a_type === 'task' ? r.entity_a_id : r.entity_b_id
  ) as string[]

  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, status, priority, metadata')
    .eq('org_id', orgId)
    .in('id', taskIds)
    .neq('status', 'archived')

  if (taskError || !tasks) return []

  const result = tasks.map((t: Record<string, unknown>) => ({
    id: t.id as string,
    title: t.title as string,
    status: t.status as string,
    priority: t.priority as string,
    targetDate: ((t.metadata as Record<string, unknown>)?.target_date as string) ?? null,
  }))

  // Write to cache
  await setCachedCrossRefs(supabase, orgId, 'contact', contactId, 'tasks', { tasks: result })

  return result
}

/**
 * Get financial signals for a contact: outstanding invoices, overdue count, last payment.
 */
export async function getFinancialSignals(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<FinancialSignal> {
  const empty: FinancialSignal = { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 }

  // Check cache first
  const cached = await getCachedCrossRefs(supabase, orgId, 'contact', contactId, 'financial')
  if (cached) {
    return cached as unknown as FinancialSignal
  }

  // Find invoice IDs linked to this contact
  const { data: rels, error: relError } = await supabase
    .from('entity_relationships')
    .select('entity_a_type, entity_a_id, entity_b_type, entity_b_id')
    .eq('org_id', orgId)
    .or(
      `and(entity_a_type.eq.contact,entity_a_id.eq.${contactId},entity_b_type.eq.invoice),and(entity_b_type.eq.contact,entity_b_id.eq.${contactId},entity_a_type.eq.invoice)`
    )

  if (relError || !rels || rels.length === 0) return empty

  const invoiceIds = rels.map((r: Record<string, unknown>) =>
    r.entity_a_type === 'invoice' ? r.entity_a_id : r.entity_b_id
  ) as string[]

  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, status, total, paid_date, due_date')
    .eq('org_id', orgId)
    .in('id', invoiceIds)

  if (invError || !invoices) return empty

  const now = new Date()
  let totalOutstanding = 0
  let overdueCount = 0
  let lastPaymentDate: string | null = null

  for (const inv of invoices as Record<string, unknown>[]) {
    if (inv.status !== 'paid') {
      totalOutstanding += (inv.total as number) || 0
      if (inv.due_date && new Date(inv.due_date as string) < now) {
        overdueCount++
      }
    }
    if (inv.paid_date) {
      if (!lastPaymentDate || (inv.paid_date as string) > lastPaymentDate) {
        lastPaymentDate = inv.paid_date as string
      }
    }
  }

  const result = {
    totalOutstanding,
    overdueCount,
    lastPaymentDate,
    invoiceCount: invoices.length,
  }

  // Write to cache
  await setCachedCrossRefs(supabase, orgId, 'contact', contactId, 'financial', result)

  return result
}

/**
 * Get deadlines for tasks linked to an entity in the next 14 days.
 */
export async function getDeadlines(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string
): Promise<Deadline[]> {
  // Check cache first
  const cached = await getCachedCrossRefs(supabase, orgId, 'contact', entityId, 'deadlines')
  if (cached) {
    return (cached.deadlines as Deadline[]) || []
  }

  // Find task IDs related to this entity
  const { data: rels, error: relError } = await supabase
    .from('entity_relationships')
    .select('entity_a_type, entity_a_id, entity_b_type, entity_b_id')
    .eq('org_id', orgId)
    .or(
      `and(entity_a_id.eq.${entityId},entity_b_type.eq.task),and(entity_b_id.eq.${entityId},entity_a_type.eq.task)`
    )

  if (relError || !rels || rels.length === 0) return []

  const taskIds = rels.map((r: Record<string, unknown>) =>
    r.entity_a_type === 'task' ? r.entity_a_id : r.entity_b_id
  ) as string[]

  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, metadata')
    .eq('org_id', orgId)
    .in('id', taskIds)
    .neq('status', 'archived')

  if (taskError || !tasks) return []

  const now = new Date()
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const deadlines: Deadline[] = []

  for (const t of tasks as Record<string, unknown>[]) {
    const meta = t.metadata as Record<string, unknown>
    const targetDate = meta?.target_date as string | undefined
    if (!targetDate) continue

    const date = new Date(targetDate)
    if (date >= now && date <= twoWeeks) {
      const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      deadlines.push({
        taskId: t.id as string,
        title: t.title as string,
        targetDate,
        daysUntil,
      })
    }
  }

  const sorted = deadlines.sort((a, b) => a.daysUntil - b.daysUntil)

  // Write to cache
  await setCachedCrossRefs(supabase, orgId, 'contact', entityId, 'deadlines', { deadlines: sorted })

  return sorted
}

/**
 * Full cross-reference for an entity: related tasks, deadlines, financial signals, waiting-for.
 */
export async function crossReference(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string
): Promise<CrossReference> {
  const empty: CrossReference = {
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: [],
  }

  if (entityType === 'contact') {
    const [relatedTasks, deadlines, financialSignals] = await Promise.all([
      getRelatedTasks(supabase, orgId, entityId),
      getDeadlines(supabase, orgId, entityId),
      getFinancialSignals(supabase, orgId, entityId),
    ])

    // Waiting-for: tasks assigned to someone else that are blocked or in progress
    const waitingFor: WaitingFor[] = relatedTasks
      .filter(t => t.status === 'blocked' || t.status === 'in_progress' || t.status === 'waiting')
      .map(t => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        assignedTo: null,
      }))

    return { relatedTasks, deadlines, financialSignals, waitingFor }
  }

  // For non-contact entities, just get deadlines
  const deadlines = await getDeadlines(supabase, orgId, entityId)
  return { ...empty, deadlines }
}

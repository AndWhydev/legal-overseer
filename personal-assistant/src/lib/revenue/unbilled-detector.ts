/**
 * Unbilled Work Detector
 *
 * Cross-references completed tasks against invoices to find work
 * that was never billed. Produces structured "recovery proposals"
 * with evidence, suggested invoice amount, and confidence score.
 *
 * Pattern: every revenue recovery recommendation produces a structured
 * "recovery proposal" artifact before taking action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { RevenueInsight } from './types'
import { dollarsToCents } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskRecord {
  id: string
  title: string
  status: string
  contact_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface InvoiceRecord {
  id: string
  client_contact_id: string | null
  project_reference: string
  total: number
  items: Array<{ description?: string }>
  status: string
  created_at: string
}

export interface RecoveryProposal {
  contact_id: string
  contact_name?: string
  tasks: Array<{
    task_id: string
    title: string
    estimated_hours?: number
    completed_at: string
  }>
  suggested_amount_cents: number
  evidence: {
    tasks_completed: number
    hours_estimated: number
    matching_invoices: number
    last_invoice_date: string | null
    gap_description: string
  }
  confidence: number
}

// ─── Detection Logic ────────────────────────────────────────────────────────

/**
 * Detect unbilled work by comparing completed tasks to invoices.
 *
 * Logic:
 * 1. Find all completed tasks with a contact_id in the given period
 * 2. For each contact, check if there are invoices covering the same period
 * 3. If tasks exist but no corresponding invoice, flag as unbilled
 * 4. Estimate value based on task metadata (hours, complexity) or default rate
 */
export async function detectUnbilledWork(
  supabase: SupabaseClient,
  orgId: string,
  options: {
    lookbackDays?: number
    defaultHourlyRateCents?: number
    defaultHoursPerTask?: number
  } = {},
): Promise<RecoveryProposal[]> {
  const {
    lookbackDays = 90,
    defaultHourlyRateCents = 15000, // $150/hr default
    defaultHoursPerTask = 2,
  } = options

  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)

  try {
    // Batch: fetch completed tasks and all invoices in one go
    const [tasksResult, invoicesResult, contactsResult] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, status, contact_id, metadata, created_at, updated_at')
        .eq('org_id', orgId)
        .eq('status', 'completed')
        .not('contact_id', 'is', null)
        .gte('updated_at', cutoffDate.toISOString()),

      supabase
        .from('invoices')
        .select('id, client_contact_id, project_reference, total, items, status, created_at')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('created_at', cutoffDate.toISOString()),

      supabase
        .from('contacts')
        .select('id, name')
        .eq('org_id', orgId),
    ])

    const tasks = (tasksResult.data ?? []) as TaskRecord[]
    const invoices = (invoicesResult.data ?? []) as InvoiceRecord[]
    const contacts = new Map(
      (contactsResult.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
    )

    if (tasks.length === 0) return []

    // Group tasks by contact
    const tasksByContact = new Map<string, TaskRecord[]>()
    for (const task of tasks) {
      if (!task.contact_id) continue
      const existing = tasksByContact.get(task.contact_id) ?? []
      existing.push(task)
      tasksByContact.set(task.contact_id, existing)
    }

    // Group invoices by contact
    const invoicesByContact = new Map<string, InvoiceRecord[]>()
    for (const inv of invoices) {
      if (!inv.client_contact_id) continue
      const existing = invoicesByContact.get(inv.client_contact_id) ?? []
      existing.push(inv)
      invoicesByContact.set(inv.client_contact_id, existing)
    }

    // Find gaps: contacts with completed tasks but no/insufficient invoices
    const proposals: RecoveryProposal[] = []

    for (const [contactId, contactTasks] of tasksByContact) {
      const contactInvoices = invoicesByContact.get(contactId) ?? []

      // Check if tasks are covered by invoices
      // Simple heuristic: if task count exceeds invoice line item count significantly,
      // there may be unbilled work
      const totalInvoiceLineItems = contactInvoices.reduce(
        (sum, inv) => sum + (Array.isArray(inv.items) ? inv.items.length : 0), 0
      )

      // Heuristic: if completed tasks significantly exceed invoiced items, flag it
      const unbilledTaskCount = Math.max(0, contactTasks.length - totalInvoiceLineItems)

      if (unbilledTaskCount <= 0) continue

      // Check for invoice descriptions that match task titles (fuzzy match)
      const invoiceDescriptions = contactInvoices.flatMap(inv =>
        Array.isArray(inv.items) ? inv.items.map(item => (item.description ?? '').toLowerCase()) : []
      )

      const unmatchedTasks = contactTasks.filter(task => {
        const titleLower = task.title.toLowerCase()
        return !invoiceDescriptions.some(desc =>
          desc.includes(titleLower) || titleLower.includes(desc)
        )
      })

      if (unmatchedTasks.length === 0) continue

      // Estimate value
      const totalHours = unmatchedTasks.reduce((sum, task) => {
        const hours = (task.metadata?.estimated_hours as number) ?? defaultHoursPerTask
        return sum + hours
      }, 0)

      const suggestedAmountCents = totalHours * defaultHourlyRateCents

      // Calculate confidence
      const lastInvoiceDate = contactInvoices.length > 0
        ? contactInvoices
            .map(i => i.created_at)
            .sort()
            .pop() ?? null
        : null

      // Higher confidence if more unmatched tasks, lower if few
      const confidence = Math.min(0.95, 0.5 + (unmatchedTasks.length * 0.08))

      proposals.push({
        contact_id: contactId,
        contact_name: contacts.get(contactId),
        tasks: unmatchedTasks.map(t => ({
          task_id: t.id,
          title: t.title,
          estimated_hours: (t.metadata?.estimated_hours as number) ?? defaultHoursPerTask,
          completed_at: t.updated_at,
        })),
        suggested_amount_cents: suggestedAmountCents,
        evidence: {
          tasks_completed: unmatchedTasks.length,
          hours_estimated: totalHours,
          matching_invoices: contactInvoices.length,
          last_invoice_date: lastInvoiceDate,
          gap_description: `${unmatchedTasks.length} completed task(s) with no matching invoice line items. Estimated ${totalHours}h of work at $${defaultHourlyRateCents / 100}/hr.`,
        },
        confidence,
      })
    }

    // Sort by amount descending (biggest opportunities first)
    proposals.sort((a, b) => b.suggested_amount_cents - a.suggested_amount_cents)

    logger.info('[unbilled-detector] Detection complete', {
      orgId,
      proposals: proposals.length,
      totalRecoverable: proposals.reduce((sum, p) => sum + p.suggested_amount_cents, 0),
    })

    return proposals
  } catch (err) {
    logger.error('[unbilled-detector] Detection failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Convert recovery proposals to revenue insights and save them.
 */
export async function saveUnbilledInsights(
  supabase: SupabaseClient,
  orgId: string,
  proposals: RecoveryProposal[],
): Promise<number> {
  if (proposals.length === 0) return 0

  // Expire old unbilled work insights
  await supabase
    .from('revenue_insights')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('insight_type', 'unbilled_work')
    .eq('status', 'active')

  const insights: Array<Omit<RevenueInsight, 'id' | 'created_at' | 'updated_at'>> = proposals.map(p => ({
    org_id: orgId,
    insight_type: 'unbilled_work' as const,
    severity: p.suggested_amount_cents >= 100000 ? 'high' as const :
              p.suggested_amount_cents >= 30000 ? 'medium' as const : 'low' as const,
    status: 'active' as const,
    title: `Unbilled work for ${p.contact_name ?? 'Unknown Client'}`,
    description: p.evidence.gap_description,
    recommended_action: `Create invoice for $${(p.suggested_amount_cents / 100).toFixed(2)} covering ${p.tasks.length} completed task(s).`,
    amount_cents: p.suggested_amount_cents,
    confidence: p.confidence,
    evidence: {
      tasks: p.tasks,
      ...p.evidence,
    },
    contact_id: p.contact_id,
    project_reference: null,
    invoice_id: null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    actioned_at: null,
    actioned_by: null,
  }))

  const { error } = await supabase
    .from('revenue_insights')
    .insert(insights)

  if (error) {
    logger.error('[unbilled-detector] Failed to save insights', { error: error.message })
    return 0
  }

  return insights.length
}

/**
 * Run full unbilled work detection pipeline.
 */
export async function runUnbilledDetection(
  supabase: SupabaseClient,
  orgId: string,
  options?: {
    lookbackDays?: number
    defaultHourlyRateCents?: number
  },
): Promise<{ proposals: RecoveryProposal[]; saved: number }> {
  const proposals = await detectUnbilledWork(supabase, orgId, options)
  const saved = await saveUnbilledInsights(supabase, orgId, proposals)
  return { proposals, saved }
}

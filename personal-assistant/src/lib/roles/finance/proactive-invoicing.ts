import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillableItem {
  contactId: string
  contactName: string
  projectId?: string
  projectName?: string
  description: string
  estimatedAmount: number
  confidence: number
  lastInvoicedAt: string | null
}

interface ProjectRow {
  id: string
  name: string
  client_contact_id: string | null
  status: string
  budget: number | null
  hourly_rate: number | null
}

interface ContactRow {
  id: string
  name: string
}

interface InvoiceRow {
  id: string
  client_contact_id: string
  project_reference: string | null
  created_at: string
  total: number
}

interface TaskRow {
  id: string
  project_id: string
  status: string
  completed_at: string | null
  estimated_hours: number | null
}

// ---------------------------------------------------------------------------
// Main: Detect Billable Work
// ---------------------------------------------------------------------------

/**
 * Scans for completed work that hasn't been invoiced yet.
 *
 * Three detection strategies:
 * 1. Projects with completed tasks but no recent invoice
 * 2. Time-tracked hours that haven't been billed
 * 3. Recurring services past their billing date
 *
 * Returns BillableItem[] sorted by confidence (highest first).
 */
export async function detectBillableWork(
  supabase: SupabaseClient,
  orgId: string,
  state: Record<string, unknown>,
): Promise<BillableItem[]> {
  const tag = `[proactive-invoicing:${orgId.slice(0, 8)}]`
  const items: BillableItem[] = []

  try {
    // 1. Find projects with completed tasks but no recent invoice
    const projectItems = await detectUnbilledProjects(supabase, orgId)
    items.push(...projectItems)

    // 2. Find time-tracked hours that haven't been billed
    const timeItems = await detectUnbilledTime(supabase, orgId)
    items.push(...timeItems)

    // 3. Find recurring services past billing date
    const recurringItems = await detectRecurringDue(supabase, orgId)
    items.push(...recurringItems)

    // Deduplicate by contactId + projectId combination
    const seen = new Set<string>()
    const deduped = items.filter((item) => {
      const key = `${item.contactId}:${item.projectId ?? 'none'}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Filter out already-surfaced items (tracked in state)
    const surfaced = (state.billable_items_surfaced as string[]) ?? []
    const surfacedSet = new Set(surfaced)
    const fresh = deduped.filter((item) => {
      const hash = billableItemHash(item)
      return !surfacedSet.has(hash)
    })

    // Sort by confidence (highest first)
    fresh.sort((a, b) => b.confidence - a.confidence)

    logger.info(`${tag} Found ${fresh.length} billable items (${items.length} raw, ${deduped.length} deduped)`)
    return fresh
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Detection failed: ${message}`)
    return []
  }
}

/**
 * Generate a stable hash for a billable item to avoid re-surfacing.
 */
export function billableItemHash(item: BillableItem): string {
  return `${item.contactId}:${item.projectId ?? 'none'}:${Math.round(item.estimatedAmount)}`
}

// ---------------------------------------------------------------------------
// Strategy 1: Unbilled completed projects
// ---------------------------------------------------------------------------

async function detectUnbilledProjects(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BillableItem[]> {
  const items: BillableItem[] = []

  // Get projects with a client contact that are active or completed
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, client_contact_id, status, budget, hourly_rate')
    .eq('org_id', orgId)
    .not('client_contact_id', 'is', null)
    .in('status', ['active', 'completed'])

  if (projErr || !projects) return items

  for (const project of projects as ProjectRow[]) {
    if (!project.client_contact_id) continue

    // Count completed tasks in this project
    const { count: completedTasks, error: taskErr } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('org_id', orgId)
      .eq('status', 'done')

    if (taskErr || !completedTasks || completedTasks === 0) continue

    // Check for recent invoices referencing this project
    const { data: recentInvoices, error: invErr } = await supabase
      .from('invoices')
      .select('id, created_at, total')
      .eq('org_id', orgId)
      .eq('client_contact_id', project.client_contact_id)
      .or(`project_reference.eq.${project.name},project_reference.eq.${project.id}`)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastInvoice = (!invErr && recentInvoices?.length) ? recentInvoices[0] as InvoiceRow : null

    // If invoiced within last 30 days, skip
    if (lastInvoice) {
      const daysSinceInvoice = daysBetween(lastInvoice.created_at, new Date().toISOString())
      if (daysSinceInvoice < 30) continue
    }

    // Get contact name
    const contact = await fetchContactName(supabase, orgId, project.client_contact_id)
    if (!contact) continue

    // Estimate amount from budget or hourly rate * completed tasks
    let estimatedAmount = 0
    let confidence = 0.6

    if (project.budget && project.budget > 0) {
      estimatedAmount = project.budget
      confidence = 0.75
    } else if (project.hourly_rate && project.hourly_rate > 0) {
      // Estimate hours from completed tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('estimated_hours')
        .eq('project_id', project.id)
        .eq('org_id', orgId)
        .eq('status', 'done')

      const totalHours = (tasks as TaskRow[] ?? []).reduce(
        (sum, t) => sum + (t.estimated_hours ?? 1),
        0,
      )
      estimatedAmount = totalHours * project.hourly_rate
      confidence = 0.65
    } else {
      // No rate info -- low confidence estimate
      estimatedAmount = 0
      confidence = 0.4
    }

    items.push({
      contactId: project.client_contact_id,
      contactName: contact.name,
      projectId: project.id,
      projectName: project.name,
      description: `${completedTasks} completed task${completedTasks > 1 ? 's' : ''} in project "${project.name}"`,
      estimatedAmount,
      confidence,
      lastInvoicedAt: lastInvoice?.created_at ?? null,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Strategy 2: Unbilled time entries
// ---------------------------------------------------------------------------

async function detectUnbilledTime(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BillableItem[]> {
  const items: BillableItem[] = []

  // Check if time_entries table exists by querying it
  const { data: entries, error } = await supabase
    .from('time_entries')
    .select('id, contact_id, project_id, hours, hourly_rate, description, created_at, invoiced')
    .eq('org_id', orgId)
    .eq('invoiced', false)
    .order('created_at', { ascending: false })
    .limit(100)

  // Table might not exist -- that's fine
  if (error || !entries || entries.length === 0) return items

  // Group by contact_id
  const byContact = new Map<string, typeof entries>()
  for (const entry of entries) {
    const cid = entry.contact_id as string
    if (!cid) continue
    const existing = byContact.get(cid) ?? []
    existing.push(entry)
    byContact.set(cid, existing)
  }

  for (const [contactId, contactEntries] of byContact) {
    const contact = await fetchContactName(supabase, orgId, contactId)
    if (!contact) continue

    const totalHours = contactEntries.reduce(
      (sum, e) => sum + (Number(e.hours) || 0),
      0,
    )
    const totalAmount = contactEntries.reduce(
      (sum, e) => sum + (Number(e.hours) || 0) * (Number(e.hourly_rate) || 0),
      0,
    )

    if (totalHours <= 0) continue

    items.push({
      contactId,
      contactName: contact.name,
      description: `${totalHours.toFixed(1)} unbilled hours across ${contactEntries.length} time entries`,
      estimatedAmount: totalAmount,
      confidence: totalAmount > 0 ? 0.85 : 0.5,
      lastInvoicedAt: null,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Strategy 3: Recurring services past billing date
// ---------------------------------------------------------------------------

async function detectRecurringDue(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BillableItem[]> {
  const items: BillableItem[] = []

  // Check recurring_services / subscriptions table
  const { data: services, error } = await supabase
    .from('recurring_services')
    .select('id, contact_id, name, amount, billing_interval, next_billing_date')
    .eq('org_id', orgId)
    .eq('active', true)
    .lte('next_billing_date', new Date().toISOString().slice(0, 10))
    .limit(50)

  // Table might not exist -- that's fine
  if (error || !services || services.length === 0) return items

  for (const service of services) {
    const contactId = service.contact_id as string
    if (!contactId) continue

    const contact = await fetchContactName(supabase, orgId, contactId)
    if (!contact) continue

    items.push({
      contactId,
      contactName: contact.name,
      description: `Recurring service "${service.name}" past billing date (${service.next_billing_date})`,
      estimatedAmount: Number(service.amount) || 0,
      confidence: 0.9,
      lastInvoicedAt: null,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchContactName(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<ContactRow | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('id', contactId)
    .single()

  if (error || !data) return null
  return data as ContactRow
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime()
  const b = new Date(dateB).getTime()
  return Math.abs(b - a) / (1000 * 60 * 60 * 24)
}

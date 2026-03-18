import type { RoleImplementation } from '../role-registry'
import type { RoleContext } from '../role-runtime'
import { registerRole } from '../role-registry'
import type { RoleEvaluation, RoleAction, RoleInsight, WorkflowDefinition } from '../role-registry'
import type { WorkflowStepDef } from '../workflow-executor'
import { runWrappedInvoiceTick } from './invoice-wrapper'
import { detectBillableWork, billableItemHash } from './proactive-invoicing'
import {
  createCollectionWorkflow,
  getCollectionStepDefs,
  getCollectionStepDef,
  type OverdueInvoice,
} from './collection-workflow'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Finance-Specific State Schema (Task 4)
// ---------------------------------------------------------------------------

/**
 * Shape of the JSONB stored in role_states.state for the finance role.
 * All fields are optional for backward compat with existing state rows.
 */
export interface FinanceState {
  /** Last time billable work detection ran */
  last_billable_scan_at: string | null
  /** Last time overdue invoice check ran */
  last_overdue_check_at: string | null
  /** IDs of active collection workflows */
  active_collection_workflows: string[]
  /** Per-contact payment speed patterns: contactId -> { avgDays, count } */
  known_payment_patterns: Record<string, { avgDays: number; count: number }>
  /** Item hashes already surfaced to avoid re-surfacing */
  billable_items_surfaced: string[]

  // Cumulative stats (from 21-01)
  last_invoice_tick_at?: string
  total_invoices_created?: number
  total_invoices_sent?: number
}

/** Type-safe accessor for finance state fields */
function getFinanceState(state: Record<string, unknown>): FinanceState {
  return {
    last_billable_scan_at: (state.last_billable_scan_at as string) ?? null,
    last_overdue_check_at: (state.last_overdue_check_at as string) ?? null,
    active_collection_workflows: (state.active_collection_workflows as string[]) ?? [],
    known_payment_patterns: (state.known_payment_patterns as Record<string, { avgDays: number; count: number }>) ?? {},
    billable_items_surfaced: (state.billable_items_surfaced as string[]) ?? [],
    last_invoice_tick_at: state.last_invoice_tick_at as string | undefined,
    total_invoices_created: state.total_invoices_created as number | undefined,
    total_invoices_sent: state.total_invoices_sent as number | undefined,
  }
}

// ---------------------------------------------------------------------------
// Finance Role Implementation
// ---------------------------------------------------------------------------

/**
 * Finance role: owns all money operations.
 *
 * Wraps the existing invoice agent (invoice-flow.ts, invoice-sender.ts)
 * as a sub-component. Proactive behaviors include:
 * - Processing approved invoice creation/duplicate-override approvals
 * - Processing approved invoice sends
 * - Detecting overdue invoices and starting collection workflows
 * - Proactively detecting billable work and surfacing insights/actions
 *
 * The role translates InvoiceFlowTickResult into RoleAction[] and
 * RoleInsight[] so the role engine can route them through the
 * autonomy gate and log activity uniformly.
 */
const financeRole: RoleImplementation = {
  type: 'finance',
  name: 'Finance',
  description: 'Owns all money operations: invoicing, collections, cash flow, financial reporting',

  async evaluate(ctx: RoleContext): Promise<RoleEvaluation> {
    const tag = `[finance-role:${ctx.orgId.slice(0, 8)}]`
    logger.info(`${tag} Evaluating...`)

    const actions: RoleAction[] = []
    const insights: RoleInsight[] = []
    const workflowsToStart: WorkflowDefinition[] = []
    const finState = getFinanceState(ctx.state.state ?? {})
    const now = new Date().toISOString()

    // -----------------------------------------------------------------------
    // 1. Run wrapped invoice tick (existing behavior -- wrap, don't rewrite)
    // -----------------------------------------------------------------------
    const tickResult = await runWrappedInvoiceTick(ctx)
    actions.push(...tickResult.actions)
    insights.push(...tickResult.insights)

    // -----------------------------------------------------------------------
    // 2. Proactive billable work detection
    // -----------------------------------------------------------------------
    const autoInvoiceEnabled = (ctx.config.config?.auto_invoice_enabled as boolean) ?? false
    if (autoInvoiceEnabled) {
      try {
        const billableItems = await detectBillableWork(
          ctx.supabase,
          ctx.orgId,
          ctx.state.state ?? {},
        )

        for (const item of billableItems) {
          if (ctx.autonomyLevel === 'observer') {
            // Observer: surface as insight only
            insights.push({
              summary: `Unbilled work detected: ${item.description} for ${item.contactName}` +
                (item.estimatedAmount > 0 ? ` (~$${item.estimatedAmount.toFixed(2)})` : ''),
              details: {
                contactId: item.contactId,
                contactName: item.contactName,
                projectId: item.projectId,
                projectName: item.projectName,
                estimatedAmount: item.estimatedAmount,
                confidence: item.confidence,
              },
              priority: item.confidence >= 0.8 ? 'high' : 'medium',
            })
          } else {
            // Co-pilot / Autopilot: surface as draft invoice action
            actions.push({
              type: 'draft_invoice',
              summary: `Draft invoice for ${item.contactName}: ${item.description}` +
                (item.estimatedAmount > 0 ? ` (~$${item.estimatedAmount.toFixed(2)})` : ''),
              payload: {
                contactId: item.contactId,
                contactName: item.contactName,
                projectId: item.projectId,
                projectName: item.projectName,
                description: item.description,
                estimatedAmount: item.estimatedAmount,
              },
              confidence: item.confidence,
              reversible: true,
            })
          }
        }

        // Track surfaced items so we don't re-surface them
        const newSurfaced = billableItems.map(billableItemHash)
        finState.billable_items_surfaced = [
          ...finState.billable_items_surfaced,
          ...newSurfaced,
        ].slice(-200) // Keep last 200 hashes

        finState.last_billable_scan_at = now

        if (billableItems.length > 0) {
          logger.info(`${tag} Proactive: found ${billableItems.length} billable items`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`${tag} Billable work detection failed: ${message}`)
      }
    }

    // -----------------------------------------------------------------------
    // 3. Check for newly overdue invoices -> start collection workflows
    // -----------------------------------------------------------------------
    try {
      const newlyOverdue = await findNewlyOverdueInvoices(ctx)

      for (const invoice of newlyOverdue) {
        // Don't start a workflow if one already exists for this invoice
        const existing = await hasActiveCollectionWorkflow(ctx, invoice.id)
        if (existing) {
          logger.info(`${tag} Collection workflow already active for ${invoice.invoiceNumber}`)
          continue
        }

        const wfDef = createCollectionWorkflow(invoice)
        workflowsToStart.push(wfDef)

        insights.push({
          summary: `Started collection workflow for invoice ${invoice.invoiceNumber} (${invoice.contactName}, $${invoice.total} ${invoice.currency}, ${invoice.daysOverdue} days overdue)`,
          details: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            contactName: invoice.contactName,
            daysOverdue: invoice.daysOverdue,
          },
          priority: 'high',
        })

        logger.info(`${tag} Starting collection workflow for ${invoice.invoiceNumber}`)
      }

      finState.last_overdue_check_at = now
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Overdue check failed: ${message}`)
    }

    // -----------------------------------------------------------------------
    // 4. Build state updates
    // -----------------------------------------------------------------------
    const stateUpdates: Record<string, unknown> = {
      last_invoice_tick_at: now,
      last_billable_scan_at: finState.last_billable_scan_at,
      last_overdue_check_at: finState.last_overdue_check_at,
      billable_items_surfaced: finState.billable_items_surfaced,
    }

    // Track cumulative stats
    const prevCreated = (finState.total_invoices_created as number) ?? 0
    const prevSent = (finState.total_invoices_sent as number) ?? 0
    const newCreated = actions.filter((a) => a.type === 'invoice_created').length
    const newSent = actions.filter((a) => a.type === 'invoice_sent').length

    if (newCreated > 0) {
      stateUpdates.total_invoices_created = prevCreated + newCreated
    }
    if (newSent > 0) {
      stateUpdates.total_invoices_sent = prevSent + newSent
    }

    logger.info(
      `${tag} Complete: ${actions.length} actions, ${insights.length} insights, ` +
      `${workflowsToStart.length} workflows to start`,
    )

    return {
      actions,
      insights,
      stateUpdates,
      workflowsToStart,
    }
  },

  // -------------------------------------------------------------------------
  // Workflow step definitions (for runtime to resume/start workflows)
  // -------------------------------------------------------------------------

  getWorkflowStepDefs(workflowType: string): WorkflowStepDef[] {
    if (workflowType === 'collection_reminder') {
      return getCollectionStepDefs()
    }
    return []
  },

  getWorkflowStepDef(workflowType: string, stepId: string): Partial<WorkflowStepDef> | undefined {
    if (workflowType === 'collection_reminder') {
      return getCollectionStepDef(stepId)
    }
    return undefined
  },

  // -------------------------------------------------------------------------
  // Haiku pre-screen: has anything changed since last tick?
  // -------------------------------------------------------------------------

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    const tag = `[finance-role:${ctx.orgId.slice(0, 8)}]`

    try {
      // Check 1: Any approved invoice actions waiting to be processed?
      const { count: approvedCount, error: approvedError } = await ctx.supabase
        .from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .in('action_type', ['invoice_create', 'invoice_duplicate_override', 'invoice_send', 'collection_reminder'])
        .eq('status', 'approved')

      if (!approvedError && (approvedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${approvedCount} approved invoice/collection actions pending`)
        return true
      }

      // Check 2: Any invoices that are now overdue?
      const today = new Date().toISOString().slice(0, 10)
      const { count: overdueCount, error: overdueError } = await ctx.supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .in('status', ['sent', 'viewed'])
        .lt('due_date', today)

      if (!overdueError && (overdueCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${overdueCount} overdue invoices found`)
        return true
      }

      // Check 3: Any new invoices created since last tick?
      const lastTickAt = ctx.state.last_tick_at
      if (lastTickAt) {
        const { count: newCount, error: newError } = await ctx.supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId)
          .gt('created_at', lastTickAt)

        if (!newError && (newCount ?? 0) > 0) {
          logger.info(`${tag} Pre-screen: ${newCount} new invoices since last tick`)
          return true
        }
      }

      // Check 4: Any active collection workflows ready for next step?
      const { count: readyWfCount, error: wfError } = await ctx.supabase
        .from('role_workflows')
        .select('id', { count: 'exact', head: true })
        .eq('role_config_id', ctx.config.id)
        .eq('status', 'active')
        .lte('next_step_at', new Date().toISOString())

      if (!wfError && (readyWfCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${readyWfCount} collection workflows ready for next step`)
        return true
      }

      return false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`${tag} Pre-screen error (proceeding with tick): ${message}`)
      // On error, proceed with tick to be safe
      return true
    }
  },

  defaultConfig() {
    return {
      tick_interval_seconds: 3600, // Hourly (finance doesn't need 5-min ticks)
      daily_budget_cents: 300,     // $3/day
      autonomy_level: 'copilot',
      config: {
        overdue_reminder_days: [7, 14, 30],
        auto_invoice_enabled: false, // Opt-in for proactive invoicing
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Helpers: Overdue Invoice Detection for Collection Workflows
// ---------------------------------------------------------------------------

/**
 * Find invoices that have become overdue (status already 'overdue')
 * and are eligible for a new collection workflow (>= 7 days overdue).
 */
async function findNewlyOverdueInvoices(ctx: RoleContext): Promise<OverdueInvoice[]> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // Find invoices marked overdue (status transitions handled by invoice-sender)
  const { data: invoices, error } = await ctx.supabase
    .from('invoices')
    .select('id, invoice_number, client_contact_id, total, currency, due_date, reminder_count, status')
    .eq('org_id', ctx.orgId)
    .eq('status', 'overdue')
    .lt('due_date', todayStr)

  if (error || !invoices) return []

  const results: OverdueInvoice[] = []

  for (const inv of invoices) {
    const dueDate = inv.due_date as string
    if (!dueDate) continue

    const daysOverdue = Math.floor(
      (today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
    )

    // Only start collection if at least 7 days overdue
    if (daysOverdue < 7) continue

    const contactId = inv.client_contact_id as string
    if (!contactId) continue

    // Fetch contact info
    const { data: contact } = await ctx.supabase
      .from('contacts')
      .select('id, name, emails')
      .eq('org_id', ctx.orgId)
      .eq('id', contactId)
      .single()

    if (!contact) continue

    const emails = (contact.emails as string[]) ?? []
    const primaryEmail = emails.find((e: string) => typeof e === 'string' && e.trim().length > 0) ?? null

    results.push({
      id: inv.id as string,
      invoiceNumber: inv.invoice_number as string,
      contactId,
      contactName: contact.name as string,
      contactEmail: primaryEmail,
      total: Number(inv.total) || 0,
      currency: (inv.currency as string) || 'AUD',
      dueDate,
      daysOverdue,
      reminderCount: Number(inv.reminder_count) || 0,
    })
  }

  return results
}

/**
 * Check if there's already an active collection workflow for a given invoice.
 */
async function hasActiveCollectionWorkflow(
  ctx: RoleContext,
  invoiceId: string,
): Promise<boolean> {
  const { count, error } = await ctx.supabase
    .from('role_workflows')
    .select('id', { count: 'exact', head: true })
    .eq('role_config_id', ctx.config.id)
    .eq('workflow_type', 'collection_reminder')
    .eq('status', 'active')
    .contains('context', { invoiceId })

  if (error) return false
  return (count ?? 0) > 0
}

// Auto-register on import
registerRole(financeRole)

export { financeRole }

import type { RoleImplementation } from '../role-registry'
import type { RoleContext, RoleTickResult } from '../role-runtime'
import { registerRole } from '../role-registry'
import type { RoleEvaluation, RoleAction, RoleInsight } from '../role-registry'
import { runWrappedInvoiceTick } from './invoice-wrapper'
import { logger } from '@/lib/core/logger'

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
 * - Detecting overdue invoices and queueing reminders
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

    // Run wrapped invoice tick (wrap, don't rewrite)
    const { actions, insights } = await runWrappedInvoiceTick(ctx)

    const stateUpdates: Record<string, unknown> = {
      last_invoice_tick_at: new Date().toISOString(),
    }

    // Track cumulative stats in role state
    const prevCreated = (ctx.state.state?.total_invoices_created as number) ?? 0
    const prevSent = (ctx.state.state?.total_invoices_sent as number) ?? 0
    const newCreated = actions.filter((a) => a.type === 'invoice_created').length
    const newSent = actions.filter((a) => a.type === 'invoice_sent').length

    if (newCreated > 0) {
      stateUpdates.total_invoices_created = prevCreated + newCreated
    }
    if (newSent > 0) {
      stateUpdates.total_invoices_sent = prevSent + newSent
    }

    logger.info(`${tag} Complete: ${actions.length} actions, ${insights.length} insights`)

    return {
      actions,
      insights,
      stateUpdates,
      workflowsToStart: [],
    }
  },

  async hasChanges(ctx: RoleContext): Promise<boolean> {
    const tag = `[finance-role:${ctx.orgId.slice(0, 8)}]`

    try {
      // Check 1: Any approved invoice actions waiting to be processed?
      const { count: approvedCount, error: approvedError } = await ctx.supabase
        .from('approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.orgId)
        .in('action_type', ['invoice_create', 'invoice_duplicate_override', 'invoice_send'])
        .eq('status', 'approved')

      if (!approvedError && (approvedCount ?? 0) > 0) {
        logger.info(`${tag} Pre-screen: ${approvedCount} approved invoice actions pending`)
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

// Auto-register on import
registerRole(financeRole)

export { financeRole }

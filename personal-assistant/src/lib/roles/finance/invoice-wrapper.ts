import type { RoleContext } from '../role-runtime'
import type { RoleAction, RoleInsight } from '../role-registry'
import { runInvoiceFlowTick, type InvoiceFlowTickResult } from '@/lib/agent/invoice-flow'
import { checkOverdueInvoices, type OverdueCheckResult } from '@/lib/agent/invoice-sender'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WrappedInvoiceTickResult {
  actions: RoleAction[]
  insights: RoleInsight[]
  raw: {
    invoiceTick: InvoiceFlowTickResult | null
    overdueCheck: OverdueCheckResult | null
  }
}

// ---------------------------------------------------------------------------
// Wrapped Invoice Tick
// ---------------------------------------------------------------------------

/**
 * Wraps the existing invoice agent functions (runInvoiceFlowTick,
 * checkOverdueInvoices) and translates their results into role
 * actions and insights.
 *
 * This function does NOT modify invoice-flow.ts or invoice-sender.ts.
 * It only calls them and maps their outputs.
 */
export async function runWrappedInvoiceTick(
  ctx: RoleContext,
): Promise<WrappedInvoiceTickResult> {
  const tag = `[invoice-wrapper:${ctx.orgId.slice(0, 8)}]`
  const actions: RoleAction[] = []
  const insights: RoleInsight[] = []

  let invoiceTick: InvoiceFlowTickResult | null = null
  let overdueCheck: OverdueCheckResult | null = null

  // 1. Run the existing invoice flow tick
  //    This processes approved invoice_create, invoice_duplicate_override,
  //    and invoice_send approvals, plus checks for overdue invoices.
  try {
    invoiceTick = await runInvoiceFlowTick(
      ctx.supabase,
      ctx.orgId,
      ctx.config.id, // role_config_id as agent_config_id
    )

    logger.info(
      `${tag} Invoice tick: ${invoiceTick.processed} processed, ` +
      `${invoiceTick.created} created, ${invoiceTick.sent} sent, ` +
      `${invoiceTick.overdue} overdue, ${invoiceTick.duplicatesBlocked} dupes blocked`,
    )

    // Convert results to role actions
    if (invoiceTick.created > 0) {
      actions.push({
        type: 'invoice_created',
        summary: `Created ${invoiceTick.created} invoice${invoiceTick.created > 1 ? 's' : ''} from approved requests`,
        payload: { count: invoiceTick.created },
        confidence: 1.0, // These were pre-approved
        reversible: true,
      })
    }

    if (invoiceTick.sent > 0) {
      actions.push({
        type: 'invoice_sent',
        summary: `Sent ${invoiceTick.sent} approved invoice${invoiceTick.sent > 1 ? 's' : ''} via email`,
        payload: { count: invoiceTick.sent },
        confidence: 1.0,
        reversible: false, // Can't unsend email
      })
    }

    if (invoiceTick.duplicatesBlocked > 0) {
      insights.push({
        summary: `Blocked ${invoiceTick.duplicatesBlocked} duplicate invoice${invoiceTick.duplicatesBlocked > 1 ? 's' : ''}`,
        details: { count: invoiceTick.duplicatesBlocked },
        priority: 'medium',
      })
    }

    if (invoiceTick.failed > 0) {
      insights.push({
        summary: `${invoiceTick.failed} invoice operation${invoiceTick.failed > 1 ? 's' : ''} failed during tick`,
        details: { count: invoiceTick.failed },
        priority: 'high',
      })
    }

    // The invoice flow tick already runs checkOverdueInvoices internally,
    // so we capture overdue from the tick result rather than running again.
    if (invoiceTick.overdue > 0) {
      actions.push({
        type: 'send_reminder',
        summary: `Detected ${invoiceTick.overdue} overdue invoice${invoiceTick.overdue > 1 ? 's' : ''} and queued reminders`,
        payload: { count: invoiceTick.overdue },
        confidence: 0.95,
        reversible: true,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Invoice tick failed: ${message}`)
    insights.push({
      summary: `Invoice tick failed: ${message}`,
      details: { error: message },
      priority: 'high',
    })
  }

  return {
    actions,
    insights,
    raw: { invoiceTick, overdueCheck },
  }
}

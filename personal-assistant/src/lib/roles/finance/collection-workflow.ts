import type { WorkflowStepDef, WorkflowStepContext } from '../workflow-executor'
import type { WorkflowDefinition } from '../role-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverdueInvoice {
  id: string
  invoiceNumber: string
  contactId: string
  contactName: string
  contactEmail: string | null
  total: number
  currency: string
  dueDate: string
  daysOverdue: number
  reminderCount: number
}

interface CollectionStepResult {
  action: 'sent_reminder' | 'skipped_paid' | 'escalated'
  invoiceId: string
  daysOverdue: number
  reminderDrafted?: string
}

// ---------------------------------------------------------------------------
// Collection Workflow Constants
// ---------------------------------------------------------------------------

/** Day thresholds for each collection step */
export const COLLECTION_SCHEDULE = {
  gentle: 7,    // Step 1: Day 7 overdue
  firm: 14,     // Step 2: Day 14 overdue
  final: 30,    // Step 3: Day 30 overdue
  escalate: 45, // Step 4: Day 45 overdue
} as const

/** Delay in seconds between steps (approx days converted) */
const STEP_DELAYS: Record<string, number> = {
  gentle_reminder: 7 * 24 * 3600,   // 7 days
  firm_reminder: 7 * 24 * 3600,     // 7 more days (day 14)
  final_notice: 16 * 24 * 3600,     // 16 more days (day 30)
  escalation: 15 * 24 * 3600,       // 15 more days (day 45)
}

// ---------------------------------------------------------------------------
// Create Collection Workflow
// ---------------------------------------------------------------------------

/**
 * Creates a WorkflowDefinition for the role runtime to start.
 * The runtime will call getWorkflowStepDefs/getWorkflowStepDef
 * to get the execution functions.
 */
export function createCollectionWorkflow(invoice: OverdueInvoice): WorkflowDefinition {
  return {
    workflowType: 'collection_reminder',
    steps: [
      { stepId: 'gentle_reminder', name: 'Gentle Reminder' },
      { stepId: 'firm_reminder', name: 'Firm Reminder' },
      { stepId: 'final_notice', name: 'Final Notice' },
      { stepId: 'escalation', name: 'Escalation Alert' },
    ],
    context: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      contactId: invoice.contactId,
      contactName: invoice.contactName,
      contactEmail: invoice.contactEmail,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      startedDaysOverdue: invoice.daysOverdue,
    },
  }
}

// ---------------------------------------------------------------------------
// Step Definitions (for resume + start)
// ---------------------------------------------------------------------------

/**
 * Returns full step definitions for the collection_reminder workflow.
 * Called by role runtime via getWorkflowStepDefs('collection_reminder').
 */
export function getCollectionStepDefs(): WorkflowStepDef[] {
  return [
    {
      id: 'gentle_reminder',
      name: 'Gentle Reminder',
      delaySeconds: STEP_DELAYS.gentle_reminder,
      condition: invoiceNotPaid,
      execute: createReminderStep('gentle'),
    },
    {
      id: 'firm_reminder',
      name: 'Firm Reminder',
      delaySeconds: STEP_DELAYS.firm_reminder,
      condition: invoiceNotPaid,
      execute: createReminderStep('firm'),
    },
    {
      id: 'final_notice',
      name: 'Final Notice',
      delaySeconds: STEP_DELAYS.final_notice,
      condition: invoiceNotPaid,
      execute: createReminderStep('final'),
    },
    {
      id: 'escalation',
      name: 'Escalation Alert',
      delaySeconds: STEP_DELAYS.escalation,
      condition: invoiceNotPaid,
      execute: createEscalationStep(),
    },
  ]
}

/**
 * Returns a single step definition override.
 * Called by role runtime via getWorkflowStepDef('collection_reminder', stepId).
 */
export function getCollectionStepDef(stepId: string): Partial<WorkflowStepDef> | undefined {
  const all = getCollectionStepDefs()
  return all.find((s) => s.id === stepId)
}

// ---------------------------------------------------------------------------
// Condition: Skip if invoice has been paid
// ---------------------------------------------------------------------------

function invoiceNotPaid(ctx: WorkflowStepContext): boolean {
  const invoiceId = ctx.workflow.context.invoiceId as string
  if (!invoiceId) return false

  // The condition function is synchronous per WorkflowStepDef interface.
  // We can't do async DB check here, but the execute function will
  // check and return success with skipped_paid action.
  // For the condition, we check if a previous step already detected payment.
  const prevResults = ctx.stepResults
  for (const [, result] of Object.entries(prevResults)) {
    const r = result as CollectionStepResult | undefined
    if (r?.action === 'skipped_paid') return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Step Factories
// ---------------------------------------------------------------------------

function createReminderStep(
  severity: 'gentle' | 'firm' | 'final',
): (ctx: WorkflowStepContext) => Promise<import('../workflow-executor').WorkflowStepResult> {
  return async (ctx) => {
    const tag = `[collection:${severity}:${(ctx.workflow.context.invoiceNumber as string) ?? 'unknown'}]`
    const invoiceId = ctx.workflow.context.invoiceId as string
    const contactName = ctx.workflow.context.contactName as string
    const invoiceNumber = ctx.workflow.context.invoiceNumber as string
    const total = ctx.workflow.context.total as number
    const currency = ctx.workflow.context.currency as string
    const dueDate = ctx.workflow.context.dueDate as string

    // Check if invoice has been paid since last step
    const { data: invoice, error } = await ctx.supabase
      .from('invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .eq('org_id', ctx.orgId)
      .single()

    if (error || !invoice) {
      logger.warn(`${tag} Could not fetch invoice ${invoiceId}`)
      return { success: true, result: { action: 'skipped_paid', invoiceId, daysOverdue: 0 } satisfies CollectionStepResult }
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      logger.info(`${tag} Invoice ${invoiceNumber} is ${invoice.status}, skipping reminder`)
      return {
        success: true,
        result: { action: 'skipped_paid', invoiceId, daysOverdue: 0 } satisfies CollectionStepResult,
      }
    }

    // Calculate actual days overdue
    const daysOverdue = Math.floor(
      (Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
    )

    // Draft the reminder based on severity and autonomy level
    const reminderDraft = draftReminder(severity, {
      contactName,
      invoiceNumber,
      total,
      currency,
      dueDate,
      daysOverdue,
    })

    // Route through autonomy gate: queue approval for the reminder
    const autonomyLevel = ctx.roleConfig.autonomy_level

    if (autonomyLevel === 'observer') {
      // Observer: just log an insight, don't queue anything
      logger.info(`${tag} Observer mode: logged ${severity} reminder insight for ${invoiceNumber}`)
    } else if (autonomyLevel === 'copilot') {
      // Co-pilot: queue for approval
      await ctx.supabase.from('approval_queue').insert({
        org_id: ctx.orgId,
        agent_config_id: ctx.roleConfig.id,
        action_type: 'collection_reminder',
        action_payload: {
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          severity,
          reminder_draft: reminderDraft,
          contact_email: ctx.workflow.context.contactEmail,
        },
        action_summary: `Send ${severity} payment reminder for invoice ${invoiceNumber} ($${total} ${currency}, ${daysOverdue} days overdue)`,
        confidence_score: severity === 'gentle' ? 0.8 : severity === 'firm' ? 0.85 : 0.9,
        routing_decision: 'ask',
        priority: severity === 'final' ? 'high' : 'normal',
        context_snapshot: {
          source: 'collection-workflow',
          workflow_id: ctx.workflow.id,
          severity,
          days_overdue: daysOverdue,
        },
      })
      logger.info(`${tag} Co-pilot: queued ${severity} reminder for approval`)
    } else if (autonomyLevel === 'autopilot') {
      // Autopilot: queue with auto-approved status for immediate processing
      await ctx.supabase.from('approval_queue').insert({
        org_id: ctx.orgId,
        agent_config_id: ctx.roleConfig.id,
        action_type: 'collection_reminder',
        action_payload: {
          invoice_id: invoiceId,
          invoice_number: invoiceNumber,
          severity,
          reminder_draft: reminderDraft,
          contact_email: ctx.workflow.context.contactEmail,
        },
        action_summary: `Auto-send ${severity} payment reminder for invoice ${invoiceNumber}`,
        confidence_score: severity === 'gentle' ? 0.8 : severity === 'firm' ? 0.85 : 0.9,
        routing_decision: 'auto',
        priority: severity === 'final' ? 'high' : 'normal',
        status: 'approved',
        context_snapshot: {
          source: 'collection-workflow',
          workflow_id: ctx.workflow.id,
          severity,
          days_overdue: daysOverdue,
          auto_approved: true,
        },
      })
      logger.info(`${tag} Autopilot: auto-approved ${severity} reminder for ${invoiceNumber}`)
    }

    // Update reminder count on the invoice
    await ctx.supabase
      .from('invoices')
      .update({ reminder_count: (daysOverdue > 0 ? Math.ceil(daysOverdue / 7) : 1) })
      .eq('id', invoiceId)
      .eq('org_id', ctx.orgId)

    return {
      success: true,
      result: {
        action: 'sent_reminder',
        invoiceId,
        daysOverdue,
        reminderDrafted: reminderDraft,
      } satisfies CollectionStepResult,
    }
  }
}

function createEscalationStep(): (ctx: WorkflowStepContext) => Promise<import('../workflow-executor').WorkflowStepResult> {
  return async (ctx) => {
    const tag = `[collection:escalation:${(ctx.workflow.context.invoiceNumber as string) ?? 'unknown'}]`
    const invoiceId = ctx.workflow.context.invoiceId as string
    const invoiceNumber = ctx.workflow.context.invoiceNumber as string
    const contactName = ctx.workflow.context.contactName as string
    const total = ctx.workflow.context.total as number
    const currency = ctx.workflow.context.currency as string
    const dueDate = ctx.workflow.context.dueDate as string

    // Check if invoice has been paid
    const { data: invoice } = await ctx.supabase
      .from('invoices')
      .select('id, status')
      .eq('id', invoiceId)
      .eq('org_id', ctx.orgId)
      .single()

    if (invoice?.status === 'paid' || invoice?.status === 'cancelled') {
      logger.info(`${tag} Invoice ${invoiceNumber} is ${invoice.status}, skipping escalation`)
      return {
        success: true,
        result: { action: 'skipped_paid', invoiceId, daysOverdue: 0 } satisfies CollectionStepResult,
      }
    }

    const daysOverdue = Math.floor(
      (Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
    )

    // Escalation always goes to the user as an insight (regardless of autonomy level)
    // This is a human decision point -- the system doesn't auto-escalate to legal etc.
    await ctx.supabase.from('role_activity').insert({
      role_config_id: ctx.roleConfig.id,
      org_id: ctx.orgId,
      activity_type: 'escalation',
      summary: `Invoice ${invoiceNumber} for ${contactName} ($${total} ${currency}) is ${daysOverdue} days overdue. All automated reminders exhausted. Manual follow-up required.`,
      details: {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        contact_name: contactName,
        total,
        currency,
        due_date: dueDate,
        days_overdue: daysOverdue,
        workflow_id: ctx.workflow.id,
      },
      autonomy_mode: ctx.roleConfig.autonomy_level,
      reversible: false,
    })

    logger.info(`${tag} Escalated invoice ${invoiceNumber} (${daysOverdue} days overdue) to user`)

    return {
      success: true,
      result: {
        action: 'escalated',
        invoiceId,
        daysOverdue,
      } satisfies CollectionStepResult,
    }
  }
}

// ---------------------------------------------------------------------------
// Reminder Drafts
// ---------------------------------------------------------------------------

interface ReminderContext {
  contactName: string
  invoiceNumber: string
  total: number
  currency: string
  dueDate: string
  daysOverdue: number
}

function draftReminder(severity: 'gentle' | 'firm' | 'final', ctx: ReminderContext): string {
  const amount = `$${ctx.total.toFixed(2)} ${ctx.currency}`

  switch (severity) {
    case 'gentle':
      return [
        `Hi ${ctx.contactName},`,
        '',
        `Just a friendly reminder that invoice ${ctx.invoiceNumber} for ${amount} was due on ${ctx.dueDate}.`,
        `It's now ${ctx.daysOverdue} days past due. If you've already sent payment, please disregard this message.`,
        '',
        'Please let us know if you have any questions.',
        '',
        'Thanks!',
      ].join('\n')

    case 'firm':
      return [
        `Hi ${ctx.contactName},`,
        '',
        `This is a follow-up regarding invoice ${ctx.invoiceNumber} for ${amount}, which was due on ${ctx.dueDate}.`,
        `The invoice is now ${ctx.daysOverdue} days overdue. We'd appreciate prompt payment or a brief update on when we can expect settlement.`,
        '',
        'If there are any issues with the invoice, please let us know so we can resolve them.',
        '',
        'Kind regards',
      ].join('\n')

    case 'final':
      return [
        `Hi ${ctx.contactName},`,
        '',
        `FINAL NOTICE: Invoice ${ctx.invoiceNumber} for ${amount} remains unpaid.`,
        `This invoice was due on ${ctx.dueDate} and is now ${ctx.daysOverdue} days overdue.`,
        '',
        'We have sent multiple reminders and require immediate payment. If we do not receive payment or hear from you within 14 days, we may need to take further action.',
        '',
        'Please contact us urgently to discuss.',
        '',
        'Regards',
      ].join('\n')
  }
}

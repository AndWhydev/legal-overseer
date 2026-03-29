import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRecord } from './approval-queue'
import type { ExecutionResult, TransportHandler, ActionType } from '@/lib/conversation/types'
import { reflectAction } from '@/lib/context/action-reflector'
import { dispatchNotification } from '@/lib/notifications/dispatcher'
import { checkSendLimit, incrementSendCount } from './send-limits'
import { logger } from '@/lib/core/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3
const INITIAL_RETRY_DELAY_MS = 500

/** HTTP status codes that are transient and worth retrying */
const TRANSIENT_ERROR_PATTERNS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'fetch failed',
  'network',
  'rate limit',
  '429',
  '502',
  '503',
  '504',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function isTransientError(error: string): boolean {
  const lower = error.toLowerCase()
  return TRANSIENT_ERROR_PATTERNS.some(p => lower.includes(p.toLowerCase()))
}

function delayMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Transport Handlers ─────────────────────────────────────────────────────

/**
 * Email transport via Resend SDK.
 * Payload: { to, subject, body, from? }
 */
const emailTransport: TransportHandler = async (_supabase, orgId, payload) => {
  const to = payload.to as string | undefined
  const subject = payload.subject as string | undefined
  const body = payload.body as string | undefined

  if (!to || !body) {
    return { success: false, error: 'Missing required fields: to, body' }
  }

  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const limitCheck = await checkSendLimit(_supabase, orgId, 'email')
  if (!limitCheck.allowed) {
    return { success: false, error: `Daily email limit reached (${limitCheck.limit})` }
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = (payload.from as string) || process.env.NOTIFICATION_FROM_EMAIL || 'bitbit@bitbit.chat'

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: subject || '(no subject)',
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <p style="font-size: 16px; line-height: 1.6; margin: 0;">${(body).replace(/\n/g, '<br/>')}</p>
    </div>`,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  await incrementSendCount(_supabase, orgId, 'email')
  return { success: true, transportMessageId: data?.id, metadata: { to, subject } }
}

/**
 * SMS transport via Telnyx.
 * Payload: { to, message }
 */
const smsTransport: TransportHandler = async (_supabase, orgId, payload) => {
  const to = payload.to as string | undefined
  const message = payload.message as string | undefined

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' }
  }

  const limitCheck = await checkSendLimit(_supabase, orgId, 'sms')
  if (!limitCheck.allowed) {
    return { success: false, error: `Daily SMS limit reached (${limitCheck.limit})` }
  }

  const { sendSMS } = await import('@/lib/channels/sms')
  const result = await sendSMS(to, message)

  if (!result.success) {
    return { success: false, error: result.error || 'SMS send failed' }
  }

  await incrementSendCount(_supabase, orgId, 'sms')
  return { success: true, transportMessageId: result.messageId, metadata: { to } }
}

/**
 * WhatsApp transport via Meta Cloud API.
 * Payload: { to, message }
 */
const whatsappTransport: TransportHandler = async (_supabase, _orgId, payload) => {
  const to = payload.to as string | undefined
  const message = payload.message as string | undefined

  if (!to || !message) {
    return { success: false, error: 'Missing required fields: to, message' }
  }

  const { sendMessage } = await import('@/lib/channels/whatsapp')
  const messageId = await sendMessage(to, message)

  if (!messageId) {
    return { success: false, error: 'WhatsApp send failed' }
  }

  return { success: true, transportMessageId: messageId, metadata: { to } }
}

/**
 * Task creation transport.
 * Payload: { title, description?, priority?, column?, contact_id?, tags? }
 */
const taskTransport: TransportHandler = async (supabase, orgId, payload) => {
  const { createTask } = await import('./shared-tools')
  const result = await createTask(supabase, orgId, {
    title: payload.title as string,
    description: payload.description as string | undefined,
    priority: payload.priority as string | undefined,
    column: payload.column as string | undefined,
    contact_id: payload.contact_id as string | undefined,
    tags: payload.tags as string[] | undefined,
  })

  if (!result.success) {
    return { success: false, error: result.error || 'Task creation failed' }
  }

  return {
    success: true,
    transportMessageId: result.data?.id as string | undefined,
    metadata: { title: payload.title },
  }
}

/**
 * Invoice creation transport — delegates to the invoice-flow pipeline.
 * Payload: matches InvoiceIntent shape from invoice-flow.ts
 */
const invoiceTransport: TransportHandler = async (supabase, orgId, payload) => {
  const { createInvoiceFromIntent } = await import('./invoice-flow')

  // The agent_config_id comes from the approval record context
  const agentConfigId = (payload._agent_config_id as string) || 'system'

  const intent = {
    source_intent: (payload.source_intent as string) || '',
    contact_name: (payload.contact_name as string | null) ?? null,
    project_reference: (payload.project_reference as string | null) ?? null,
    amount: (payload.amount as number | null) ?? null,
    currency: (payload.currency as string) || 'AUD',
    terms_days: (payload.terms_days as number) || 14,
    line_items: payload.line_items as Array<{ description: string; quantity: number; unit_price: number; total: number }> | undefined,
  }

  const result = await createInvoiceFromIntent(supabase, orgId, intent, agentConfigId, {
    requireApproval: false,
    allowDuplicateOverride: false,
  })

  if (result.status === 'created') {
    return { success: true, transportMessageId: result.invoiceId, metadata: { status: 'created' } }
  }

  if (result.status === 'queued') {
    return { success: true, metadata: { status: 'queued', approvalId: result.approvalId } }
  }

  if (result.status === 'error') {
    return { success: false, error: result.error }
  }

  return { success: false, error: `Invoice flow returned: ${result.status}` }
}

/**
 * Invoice send transport — processes a single approved invoice send.
 * Payload: { invoice_id }
 */
const invoiceSendTransport: TransportHandler = async (supabase, orgId, payload) => {
  const { processApprovedInvoiceSends } = await import('./invoice-sender')
  const result = await processApprovedInvoiceSends(supabase, orgId)

  if (result.sent > 0) {
    return { success: true, metadata: { sent: result.sent } }
  }

  if (result.failed > 0) {
    return { success: false, error: 'Invoice send processing failed' }
  }

  return { success: true, metadata: { status: 'no_pending_sends', invoiceId: payload.invoice_id } }
}

/**
 * Reminder/scheduling transport — creates a task with a deadline as a stub.
 * Payload: { title, due_at, contact_id? }
 */
const reminderTransport: TransportHandler = async (supabase, orgId, payload) => {
  const { createTask } = await import('./shared-tools')
  const result = await createTask(supabase, orgId, {
    title: (payload.title as string) || 'Reminder',
    description: `Scheduled reminder for ${payload.due_at as string || 'soon'}`,
    priority: 'normal',
    contact_id: payload.contact_id as string | undefined,
  })

  if (!result.success) {
    return { success: false, error: result.error || 'Reminder creation failed' }
  }

  return {
    success: true,
    transportMessageId: result.data?.id as string | undefined,
    metadata: { due_at: payload.due_at },
  }
}

// ─── Transport Map ──────────────────────────────────────────────────────────

const TRANSPORT_MAP: Record<ActionType, TransportHandler> = {
  send_email: emailTransport,
  send_sms: smsTransport,
  send_whatsapp: whatsappTransport,
  create_task: taskTransport,
  invoice_create: invoiceTransport,
  invoice_send: invoiceSendTransport,
  schedule_reminder: reminderTransport,
  // Role-specific aliases — map to standard transports
  draft_invoice: invoiceTransport,
  collection_reminder: emailTransport,
  nurture_email: emailTransport,
  draft_response: emailTransport,
  cash_flow_alert: taskTransport,
  tender_match: taskTransport,
  seo_ranking_drop: taskTransport,
}

// ─── Core Executor ──────────────────────────────────────────────────────────

/**
 * Execute an approved action through the transport dispatch map.
 *
 * Flow:
 *  1. Transition status: approved → executing
 *  2. Look up transport handler
 *  3. Execute with retry (exponential backoff, max 3 attempts)
 *  4. On success: status → completed, store result
 *  5. On failure: status → failed, store error
 *  6. Fire context reflector (fire-and-forget)
 *  7. Dispatch notification (fire-and-forget)
 */
export async function executeApprovedAction(
  supabase: SupabaseClient,
  approval: ApprovalRecord,
): Promise<ExecutionResult> {
  const actionType = approval.action_type as ActionType
  const handler = TRANSPORT_MAP[actionType]

  if (!handler) {
    // Fallback: unmapped action types create a task for human visibility
    logger.warn(`[action-executor] No transport handler for ${actionType}, falling back to create_task`)
    const fallbackHandler = taskTransport
    const result = await executeWithRetry(supabase, approval, fallbackHandler)
    if (result.success) {
      await updateExecutionStatus(supabase, approval.id, 'completed', result)
    } else {
      await updateExecutionStatus(supabase, approval.id, 'failed', undefined, result.error)
    }
    return result
  }

  // 1. Atomic transition: approved → executing (idempotency guard)
  // Only the first caller to claim this row proceeds; concurrent callers get 0 rows.
  const { data: claimed, error: claimError } = await supabase
    .from('approval_queue')
    .update({
      status: 'executing',
      execution_started_at: new Date().toISOString(),
    })
    .eq('id', approval.id)
    .eq('status', 'approved')
    .select('id')

  if (claimError) {
    logger.error('[action-executor] Failed to claim approval for execution:', claimError.message)
    return { success: false, error: 'Failed to start execution' }
  }

  if (!claimed || claimed.length === 0) {
    // Another caller already started executing — not an error, just a no-op
    logger.info('[action-executor] Approval already claimed for execution:', approval.id)
    return { success: true, metadata: { alreadyClaimed: true } }
  }

  // 2. Execute with retry
  const result = await executeWithRetry(supabase, approval, handler)

  // 3. Update final status
  if (result.success) {
    await updateExecutionStatus(supabase, approval.id, 'completed', result)
  } else {
    await updateExecutionStatus(supabase, approval.id, 'failed', undefined, result.error)
  }

  // 4. Fire context reflector (fire-and-forget)
  reflectAction(
    supabase,
    approval.org_id,
    actionType,
    approval.action_payload,
    result,
  ).catch(err => {
    logger.warn('[action-executor] reflectAction failed:', err)
  })

  // 5. Dispatch notification (fire-and-forget)
  const notificationType = result.success ? 'info' as const : 'agent_error' as const
  const urgency = result.success ? 'normal' as const : 'high' as const
  dispatchNotification(supabase, {
    orgId: approval.org_id,
    type: notificationType,
    title: result.success
      ? `Action completed: ${approval.action_summary}`
      : `Action failed: ${approval.action_summary}`,
    body: result.success
      ? `Successfully executed ${actionType}`
      : `Failed to execute ${actionType}: ${result.error}`,
    urgency,
    metadata: {
      approvalId: approval.id,
      actionType,
      executionResult: result,
    },
  }).catch(err => {
    logger.warn('[action-executor] dispatchNotification failed:', err)
  })

  return result
}

// ─── Retry Logic ────────────────────────────────────────────────────────────

async function executeWithRetry(
  supabase: SupabaseClient,
  approval: ApprovalRecord,
  handler: TransportHandler,
): Promise<ExecutionResult> {
  const actionType = approval.action_type as ActionType
  let lastError: string | undefined
  let retryCount = 0

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await handler(supabase, approval.org_id, {
        ...approval.action_payload,
        _agent_config_id: approval.agent_config_id,
      })

      if (result.success) {
        return result
      }

      // Permanent failure — don't retry
      if (!isTransientError(result.error || '')) {
        return result
      }

      lastError = result.error
      retryCount = attempt + 1
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      lastError = errorMsg

      // Permanent failure — don't retry
      if (!isTransientError(errorMsg)) {
        return { success: false, error: errorMsg }
      }

      retryCount = attempt + 1
    }

    // Update retry count in DB
    await supabase
      .from('approval_queue')
      .update({ retry_count: retryCount })
      .eq('id', approval.id)

    // Exponential backoff before next attempt
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      const waitMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)
      logger.warn(
        `[action-executor] ${actionType} failed (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}), retrying in ${waitMs}ms: ${lastError}`,
      )
      await delayMs(waitMs)
    }
  }

  return {
    success: false,
    error: `Failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError}`,
  }
}

// ─── Status Updates ─────────────────────────────────────────────────────────

async function updateExecutionStatus(
  supabase: SupabaseClient,
  approvalId: string,
  status: 'executing' | 'completed' | 'failed',
  result?: ExecutionResult,
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status }

  if (status === 'executing') {
    update.execution_started_at = new Date().toISOString()
  }

  if (status === 'completed' || status === 'failed') {
    update.execution_completed_at = new Date().toISOString()
  }

  if (result) {
    update.execution_result = {
      success: result.success,
      transportMessageId: result.transportMessageId,
      metadata: result.metadata,
    }
  }

  if (error) {
    update.execution_error = error
  }

  const { error: dbError } = await supabase
    .from('approval_queue')
    .update(update)
    .eq('id', approvalId)

  if (dbError) {
    logger.error('[action-executor] Failed to update execution status:', dbError.message)
  }
}

// ─── Re-queue Expired Actions ───────────────────────────────────────────────

/**
 * Create a new approval with the same action_payload and a fresh 24h expiry.
 * Used when a user references a previously expired action.
 */
export async function requeueExpiredAction(
  supabase: SupabaseClient,
  expiredApproval: ApprovalRecord,
): Promise<ApprovalRecord> {
  const { createApproval } = await import('./approval-queue')

  return createApproval(supabase, {
    org_id: expiredApproval.org_id,
    agent_config_id: expiredApproval.agent_config_id,
    agent_run_id: expiredApproval.agent_run_id,
    action_type: expiredApproval.action_type,
    action_payload: expiredApproval.action_payload,
    action_summary: expiredApproval.action_summary,
    confidence_score: expiredApproval.confidence_score,
    routing_decision: 'ask',
    priority: expiredApproval.priority,
    context_snapshot: {
      ...expiredApproval.context_snapshot,
      requeued_from: expiredApproval.id,
      requeued_at: new Date().toISOString(),
    },
  })
}

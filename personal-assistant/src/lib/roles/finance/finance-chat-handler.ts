import type { SupabaseClient } from '@supabase/supabase-js'
import type { AutonomyLevel } from '@/lib/bitbit-core'
import {
  createInvoiceFromIntent,
  parseInvoiceIntent,
  type CreateInvoiceFromIntentResult,
  type InvoiceIntent,
} from '@/lib/agent/invoice-flow'
import { routeThroughAutonomyGate, type GateResult } from '../autonomy-gate'
import { getRole } from '../role-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinanceChatResult =
  | { handled: true; action: 'queued'; approvalId: string; gateResult: GateResult }
  | { handled: true; action: 'created'; invoiceId: string; invoiceNumber: string; gateResult: GateResult }
  | { handled: true; action: 'duplicate'; existingInvoiceId: string; gateResult: GateResult }
  | { handled: true; action: 'logged_insight'; gateResult: GateResult }
  | { handled: true; action: 'error'; error: string }
  | { handled: false; reason: string }

// ---------------------------------------------------------------------------
// Finance Chat Handler
// ---------------------------------------------------------------------------

/**
 * Routes finance-related chat messages through the Finance role's
 * autonomy gate before delegating to the invoice pipeline.
 *
 * When the user says "invoice Sezer for the White House RE work",
 * this handler:
 * 1. Parses the invoice intent from the message
 * 2. Routes through the autonomy gate based on the role's current level
 * 3. Delegates to createInvoiceFromIntent for execution or approval queueing
 *
 * The autonomy level comes from the org's finance role config. If no
 * finance role is configured, defaults to 'copilot' (queue for approval).
 */
export async function handleFinanceChat(
  supabase: SupabaseClient,
  orgId: string,
  message: string,
  options?: {
    agentConfigId?: string
    autonomyLevel?: AutonomyLevel
    intent?: InvoiceIntent
  },
): Promise<FinanceChatResult> {
  const tag = `[finance-chat:${orgId.slice(0, 8)}]`

  try {
    // 1. Parse intent (or use pre-parsed intent from caller)
    const intent = options?.intent ?? parseInvoiceIntent(message)

    if (!intent.contact_name) {
      return { handled: false, reason: 'no_contact_name_in_message' }
    }

    // 2. Resolve the finance role's autonomy level
    const autonomyLevel = await resolveFinanceAutonomyLevel(
      supabase,
      orgId,
      options?.autonomyLevel,
    )

    // 3. Resolve agent config ID (finance role config or fallback)
    const agentConfigId = options?.agentConfigId
      ?? await resolveFinanceAgentConfigId(supabase, orgId)

    if (!agentConfigId) {
      return { handled: true, action: 'error', error: 'no_agent_config' }
    }

    // 4. Create a role action for the autonomy gate
    const invoiceAction = {
      type: 'invoice_create',
      summary: `Create invoice for ${intent.contact_name}${intent.project_reference ? ` - ${intent.project_reference}` : ''}`,
      payload: {
        contact_name: intent.contact_name,
        project_reference: intent.project_reference,
        amount: intent.amount,
        currency: intent.currency,
        terms_days: intent.terms_days,
        source_intent: intent.source_intent,
      },
      confidence: 0.85, // Chat-initiated invoices have moderate confidence
      reversible: true,
    }

    // 5. Route through autonomy gate
    const gateResult = routeThroughAutonomyGate(invoiceAction, autonomyLevel)

    logger.info(`${tag} Gate decision: ${gateResult.decision} (autonomy: ${autonomyLevel})`)

    // 6. Execute based on gate decision
    switch (gateResult.decision) {
      case 'execute': {
        // Autopilot + high confidence: create directly (no approval needed)
        const result = await createInvoiceFromIntent(
          supabase, orgId, intent, agentConfigId,
          { requireApproval: false },
        )
        return mapInvoiceResult(result, gateResult)
      }

      case 'queue_approval': {
        // Copilot or low confidence: queue for approval
        const result = await createInvoiceFromIntent(
          supabase, orgId, intent, agentConfigId,
          { requireApproval: true },
        )
        return mapInvoiceResult(result, gateResult)
      }

      case 'log_insight': {
        // Observer mode: just log, don't create anything
        logger.info(`${tag} Observer mode: logging invoice intent as insight`)
        return { handled: true, action: 'logged_insight', gateResult }
      }

      case 'escalate': {
        // Escalation: queue for approval with urgent priority
        const result = await createInvoiceFromIntent(
          supabase, orgId, intent, agentConfigId,
          { requireApproval: true },
        )
        return mapInvoiceResult(result, gateResult)
      }

      default: {
        return { handled: true, action: 'error', error: `unknown_gate_decision: ${gateResult.decision}` }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Finance chat error: ${message}`)
    return { handled: true, action: 'error', error: message }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the finance role's autonomy level for an org.
 * Falls back to the provided override, then the role_configs table,
 * then 'copilot' as default.
 */
async function resolveFinanceAutonomyLevel(
  supabase: SupabaseClient,
  orgId: string,
  override?: AutonomyLevel,
): Promise<AutonomyLevel> {
  if (override) return override

  const { data, error } = await supabase
    .from('role_configs')
    .select('autonomy_level')
    .eq('org_id', orgId)
    .eq('role_type', 'finance')
    .eq('enabled', true)
    .single()

  if (error || !data) {
    return 'copilot' // Safe default
  }

  return (data.autonomy_level as AutonomyLevel) ?? 'copilot'
}

/**
 * Resolve the agent config ID for the finance role.
 * First checks role_configs, then falls back to agent_configs with
 * agent_type 'invoice-flow'.
 */
async function resolveFinanceAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  // Try role_configs first
  const { data: roleConfig } = await supabase
    .from('role_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('role_type', 'finance')
    .eq('enabled', true)
    .single()

  if (roleConfig?.id) return roleConfig.id

  // Fallback to legacy agent_configs
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'invoice-flow')
    .limit(1)

  const row = (agentConfig ?? [])[0] as { id: string } | undefined
  return row?.id ?? null
}

/**
 * Map CreateInvoiceFromIntentResult to FinanceChatResult.
 */
function mapInvoiceResult(
  result: CreateInvoiceFromIntentResult,
  gateResult: GateResult,
): FinanceChatResult {
  switch (result.status) {
    case 'queued':
      return { handled: true, action: 'queued', approvalId: result.approvalId, gateResult }
    case 'created':
      return { handled: true, action: 'created', invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, gateResult }
    case 'duplicate':
      return { handled: true, action: 'duplicate', existingInvoiceId: result.existingInvoiceId, gateResult }
    case 'error':
      return { handled: true, action: 'error', error: result.error }
  }
}

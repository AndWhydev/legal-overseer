import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service-client'
import {
  createInvoiceFromIntent,
  runInvoiceFlowTick,
  type InvoiceIntent,
} from '@/lib/agent/invoice-flow'
import { logger } from '@/lib/core/logger'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/agent/invoices/dispatch
 *
 * Internal endpoint for Fly.io worker to delegate invoice-flow execution
 * back to the Vercel app where the full invoice pipeline is available.
 *
 * Auth: Bearer WORKER_AUTH_TOKEN (same token used by Cloudflare -> Fly.io)
 *
 * Modes:
 *   1. "tick" mode (default): runs the full invoice flow tick for the org
 *      Body: { org_id: string, mode?: "tick" }
 *
 *   2. "create" mode: creates a single invoice from intent
 *      Body: { org_id: string, mode: "create", intent: InvoiceIntent }
 */
export async function POST(request: NextRequest) {
  const tag = '[agent/invoices/dispatch]'

  // Validate WORKER_AUTH_TOKEN
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.WORKER_AUTH_TOKEN
  if (!expectedToken) {
    logger.error(`${tag} WORKER_AUTH_TOKEN not configured`)
    return NextResponse.json(
      { error: 'Server misconfigured: missing WORKER_AUTH_TOKEN' },
      { status: 500 },
    )
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    logger.warn(`${tag} Unauthorized dispatch request`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    org_id?: string
    mode?: 'tick' | 'create'
    intent?: InvoiceIntent
    agent_config_id?: string
    task_id?: string
  }

  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const orgId = body.org_id
  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getServiceClient()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Service client init failed: ${msg}`)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const mode = body.mode || 'tick'
  const startMs = Date.now()

  try {
    if (mode === 'create') {
      // Single invoice creation from intent
      const intent = body.intent
      if (!intent || !intent.contact_name) {
        return NextResponse.json(
          { error: 'intent with contact_name is required for create mode' },
          { status: 400 },
        )
      }

      const agentConfigId = body.agent_config_id || await resolveAgentConfigId(supabase, orgId)
      if (!agentConfigId) {
        return NextResponse.json(
          { error: 'invoice-flow agent config not found for org' },
          { status: 400 },
        )
      }

      const result = await createInvoiceFromIntent(supabase, orgId, intent, agentConfigId, {
        requireApproval: true,
      })

      const durationMs = Date.now() - startMs
      logger.info(`${tag} create mode completed in ${durationMs}ms: status=${result.status}`)

      return NextResponse.json({
        success: result.status !== 'error',
        duration_ms: durationMs,
        result,
      })
    }

    // Default: run full invoice flow tick
    const agentConfigId = body.agent_config_id || await resolveAgentConfigId(supabase, orgId)
    if (!agentConfigId) {
      return NextResponse.json(
        { error: 'invoice-flow agent config not found for org' },
        { status: 400 },
      )
    }

    const result = await runInvoiceFlowTick(supabase, orgId, agentConfigId)
    const durationMs = Date.now() - startMs
    logger.info(
      `${tag} tick mode completed in ${durationMs}ms: processed=${result.processed} created=${result.created} sent=${result.sent}`,
    )

    return NextResponse.json({
      success: true,
      duration_ms: durationMs,
      result,
    })
  } catch (err) {
    const durationMs = Date.now() - startMs
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`${tag} Failed after ${durationMs}ms: ${msg}`)
    return NextResponse.json(
      { success: false, duration_ms: durationMs, error: msg },
      { status: 500 },
    )
  }
}

/**
 * Resolve the invoice-flow agent_config_id for a given org.
 */
async function resolveAgentConfigId(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('org_id', orgId)
    .eq('agent_type', 'invoice-flow')
    .limit(1)

  const first = (data ?? [])[0] as { id: string } | undefined
  return first?.id ?? null
}

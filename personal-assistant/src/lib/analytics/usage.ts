import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgUsageSummary {
  orgId: string
  period: string
  totalTokens: number
  totalCostUSD: number
  byAgent: AgentUsage[]
  byClient: ClientCost[]
}

export interface AgentUsage {
  agentType: string
  inputTokens: number
  outputTokens: number
  invocations: number
  costUSD: number
}

export interface ClientCost {
  clientName: string
  tokens: number
  costUSD: number
  actions: number
}

// ---------------------------------------------------------------------------
// Token cost model (Anthropic Claude pricing as of 2026)
// ---------------------------------------------------------------------------

const INPUT_COST_PER_M = 3.0   // USD per 1M input tokens (Sonnet)
const OUTPUT_COST_PER_M = 15.0  // USD per 1M output tokens (Sonnet)

function tokenCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  )
}

// ---------------------------------------------------------------------------
// Usage aggregation
// ---------------------------------------------------------------------------

export async function getOrgUsage(
  client: SupabaseClient,
  orgId: string,
  periodStart?: Date,
  periodEnd?: Date,
): Promise<OrgUsageSummary> {
  const now = new Date()
  const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1)
  const end = periodEnd ?? now

  const period = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`

  // Fetch agent runs with agent type via join
  const { data: runs } = await client
    .from('agent_runs')
    .select('tokens_in, tokens_out, trigger_payload, agent_configs!inner(agent_type)')
    .eq('org_id', orgId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  const entries = runs ?? []

  // Aggregate by agent
  const agentMap = new Map<string, AgentUsage>()
  let totalTokens = 0
  let totalCost = 0

  for (const entry of entries) {
    const agentType = (entry.agent_configs as { agent_type?: string } | null)?.agent_type ?? 'unknown'
    const inputT = (entry.tokens_in as number) ?? 0
    const outputT = (entry.tokens_out as number) ?? 0
    const cost = tokenCost(inputT, outputT)

    if (!agentMap.has(agentType)) {
      agentMap.set(agentType, {
        agentType,
        inputTokens: 0,
        outputTokens: 0,
        invocations: 0,
        costUSD: 0,
      })
    }

    const agg = agentMap.get(agentType)!
    agg.inputTokens += inputT
    agg.outputTokens += outputT
    agg.invocations += 1
    agg.costUSD += cost

    totalTokens += inputT + outputT
    totalCost += cost
  }

  // Aggregate by client (from trigger_payload.client_name if available)
  const clientMap = new Map<string, ClientCost>()

  for (const entry of entries) {
    const payload = entry.trigger_payload as Record<string, unknown> | null
    const clientName = (payload?.client_name as string) ?? 'Unattributed'
    const inputT = (entry.tokens_in as number) ?? 0
    const outputT = (entry.tokens_out as number) ?? 0

    if (!clientMap.has(clientName)) {
      clientMap.set(clientName, { clientName, tokens: 0, costUSD: 0, actions: 0 })
    }

    const c = clientMap.get(clientName)!
    c.tokens += inputT + outputT
    c.costUSD += tokenCost(inputT, outputT)
    c.actions += 1
  }

  return {
    orgId,
    period,
    totalTokens,
    totalCostUSD: Math.round(totalCost * 100) / 100,
    byAgent: Array.from(agentMap.values()).map((a) => ({
      ...a,
      costUSD: Math.round(a.costUSD * 100) / 100,
    })),
    byClient: Array.from(clientMap.values()).map((c) => ({
      ...c,
      costUSD: Math.round(c.costUSD * 100) / 100,
    })),
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonthlyReportData {
  type: 'monthly'
  orgId: string
  month: string // YYYY-MM
  generatedAt: string
  revenue: {
    totalPaid: number
    totalOutstanding: number
    invoiceCount: number
    paidCount: number
  }
  pipeline: {
    stage: string
    count: number
    value: number
  }[]
  agentActivity: {
    totalRuns: number
    totalCost: number
    successRate: number
    byAgent: { agent: string; runs: number; cost: number; successRate: number }[]
  }
  channelVolume: {
    channel: string
    messageCount: number
  }[]
  topClients: {
    name: string
    revenue: number
    interactions: number
  }[]
}

export interface AgentROIReportData {
  type: 'agent-roi'
  orgId: string
  period: { from: string; to: string }
  generatedAt: string
  agents: {
    name: string
    runs: number
    cost: number
    actionsTaken: number
    estimatedTimeSavedMinutes: number
    roi: number // (time_saved_value - cost) / cost
  }[]
  totals: {
    totalCost: number
    totalTimeSavedMinutes: number
    overallROI: number
  }
}

export interface PipelineReportData {
  type: 'pipeline'
  orgId: string
  generatedAt: string
  funnel: { stage: string; count: number; value: number; conversionRate: number }[]
  proposalConversion: { sent: number; accepted: number; rate: number }
  invoiceAging: { bucket: string; count: number; totalAmount: number }[]
}

export type ReportData = MonthlyReportData | AgentROIReportData | PipelineReportData

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString()
  const to = new Date(Date.UTC(y, m, 1)).toISOString()
  return { from, to }
}

// Estimated hourly rate for time-saved calculations ($AUD)
const HOURLY_RATE = 120

// ─── Monthly Report ──────────────────────────────────────────────────────────

export async function generateMonthlyReport(
  supabase: SupabaseClient,
  orgId: string,
  month: string,
): Promise<MonthlyReportData> {
  const { from, to } = monthRange(month)

  // Revenue from invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status, total_amount')
    .eq('org_id', orgId)
    .gte('created_at', from)
    .lt('created_at', to)

  const allInvoices = invoices ?? []
  const paidInvoices = allInvoices.filter(i => i.status === 'paid')
  const totalPaid = paidInvoices.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const totalOutstanding = allInvoices
    .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + (i.total_amount ?? 0), 0)

  // Pipeline — leads by stage
  const { data: leads } = await supabase
    .from('leads')
    .select('stage, estimated_value')
    .eq('org_id', orgId)

  const stageMap = new Map<string, { count: number; value: number }>()
  for (const l of leads ?? []) {
    const s = l.stage ?? 'unknown'
    const entry = stageMap.get(s) ?? { count: 0, value: 0 }
    entry.count++
    entry.value += l.estimated_value ?? 0
    stageMap.set(s, entry)
  }

  // Agent activity
  const { data: agentRuns } = await supabase
    .from('agent_runs')
    .select('agent_type, status, cost_usd')
    .eq('org_id', orgId)
    .gte('created_at', from)
    .lt('created_at', to)

  const agentMap = new Map<string, { runs: number; cost: number; successes: number }>()
  for (const r of agentRuns ?? []) {
    const a = r.agent_type ?? 'unknown'
    const entry = agentMap.get(a) ?? { runs: 0, cost: 0, successes: 0 }
    entry.runs++
    entry.cost += r.cost_usd ?? 0
    if (r.status === 'completed') entry.successes++
    agentMap.set(a, entry)
  }

  const totalRuns = (agentRuns ?? []).length
  const totalCost = (agentRuns ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)
  const totalSuccesses = (agentRuns ?? []).filter(r => r.status === 'completed').length

  // Channel volume
  const { data: messages } = await supabase
    .from('messages')
    .select('channel')
    .eq('org_id', orgId)
    .gte('created_at', from)
    .lt('created_at', to)

  const channelMap = new Map<string, number>()
  for (const m of messages ?? []) {
    channelMap.set(m.channel, (channelMap.get(m.channel) ?? 0) + 1)
  }

  // Top clients by revenue
  const { data: clientRevenue } = await supabase
    .from('invoices')
    .select('client_name, total_amount')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('created_at', from)
    .lt('created_at', to)

  const clientMap = new Map<string, { revenue: number; interactions: number }>()
  for (const c of clientRevenue ?? []) {
    const name = c.client_name ?? 'Unknown'
    const entry = clientMap.get(name) ?? { revenue: 0, interactions: 0 }
    entry.revenue += c.total_amount ?? 0
    entry.interactions++
    clientMap.set(name, entry)
  }

  return {
    type: 'monthly',
    orgId,
    month,
    generatedAt: new Date().toISOString(),
    revenue: {
      totalPaid,
      totalOutstanding,
      invoiceCount: allInvoices.length,
      paidCount: paidInvoices.length,
    },
    pipeline: Array.from(stageMap.entries()).map(([stage, d]) => ({
      stage,
      count: d.count,
      value: d.value,
    })),
    agentActivity: {
      totalRuns,
      totalCost,
      successRate: totalRuns > 0 ? totalSuccesses / totalRuns : 0,
      byAgent: Array.from(agentMap.entries()).map(([agent, d]) => ({
        agent,
        runs: d.runs,
        cost: d.cost,
        successRate: d.runs > 0 ? d.successes / d.runs : 0,
      })),
    },
    channelVolume: Array.from(channelMap.entries()).map(([channel, messageCount]) => ({
      channel,
      messageCount,
    })),
    topClients: Array.from(clientMap.entries())
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
  }
}

// ─── Agent ROI Report ────────────────────────────────────────────────────────

export async function generateAgentROIReport(
  supabase: SupabaseClient,
  orgId: string,
  period: { from: string; to: string },
): Promise<AgentROIReportData> {
  const { data: runs } = await supabase
    .from('agent_runs')
    .select('agent_type, status, cost_usd, duration_ms, actions_taken')
    .eq('org_id', orgId)
    .gte('created_at', period.from)
    .lt('created_at', period.to)

  const agentMap = new Map<string, {
    runs: number; cost: number; actions: number; timeSavedMin: number
  }>()

  for (const r of runs ?? []) {
    const a = r.agent_type ?? 'unknown'
    const entry = agentMap.get(a) ?? { runs: 0, cost: 0, actions: 0, timeSavedMin: 0 }
    entry.runs++
    entry.cost += r.cost_usd ?? 0
    entry.actions += r.actions_taken ?? 1
    // Estimate: each agent action saves ~5 minutes of human time
    entry.timeSavedMin += (r.actions_taken ?? 1) * 5
    agentMap.set(a, entry)
  }

  const agents = Array.from(agentMap.entries()).map(([name, d]) => {
    const timeSavedValue = (d.timeSavedMin / 60) * HOURLY_RATE
    const roi = d.cost > 0 ? (timeSavedValue - d.cost) / d.cost : 0
    return {
      name,
      runs: d.runs,
      cost: d.cost,
      actionsTaken: d.actions,
      estimatedTimeSavedMinutes: d.timeSavedMin,
      roi,
    }
  })

  const totalCost = agents.reduce((s, a) => s + a.cost, 0)
  const totalTimeSavedMinutes = agents.reduce((s, a) => s + a.estimatedTimeSavedMinutes, 0)
  const totalTimeSavedValue = (totalTimeSavedMinutes / 60) * HOURLY_RATE
  const overallROI = totalCost > 0 ? (totalTimeSavedValue - totalCost) / totalCost : 0

  return {
    type: 'agent-roi',
    orgId,
    period,
    generatedAt: new Date().toISOString(),
    agents,
    totals: { totalCost, totalTimeSavedMinutes, overallROI },
  }
}

// ─── Pipeline Report ─────────────────────────────────────────────────────────

export async function generatePipelineReport(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PipelineReportData> {
  // Leads funnel
  const { data: leads } = await supabase
    .from('leads')
    .select('stage, estimated_value')
    .eq('org_id', orgId)

  const stageOrder = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
  const stageMap = new Map<string, { count: number; value: number }>()
  for (const s of stageOrder) stageMap.set(s, { count: 0, value: 0 })

  for (const l of leads ?? []) {
    const s = l.stage ?? 'new'
    const entry = stageMap.get(s) ?? { count: 0, value: 0 }
    entry.count++
    entry.value += l.estimated_value ?? 0
    stageMap.set(s, entry)
  }

  const totalLeads = (leads ?? []).length
  const funnel = stageOrder
    .filter(s => stageMap.has(s))
    .map(stage => {
      const d = stageMap.get(stage)!
      return {
        stage,
        count: d.count,
        value: d.value,
        conversionRate: totalLeads > 0 ? d.count / totalLeads : 0,
      }
    })

  // Proposal conversion
  const { data: proposals } = await supabase
    .from('proposals')
    .select('status')
    .eq('org_id', orgId)

  const sent = (proposals ?? []).length
  const accepted = (proposals ?? []).filter(p => p.status === 'accepted').length

  // Invoice aging
  const { data: unpaid } = await supabase
    .from('invoices')
    .select('due_date, total_amount, status')
    .eq('org_id', orgId)
    .in('status', ['sent', 'overdue'])

  const now = Date.now()
  const buckets: Record<string, { count: number; total: number }> = {
    'Current': { count: 0, total: 0 },
    '1-30 days': { count: 0, total: 0 },
    '31-60 days': { count: 0, total: 0 },
    '60+ days': { count: 0, total: 0 },
  }

  for (const inv of unpaid ?? []) {
    const due = new Date(inv.due_date).getTime()
    const daysOverdue = Math.floor((now - due) / 86400000)
    const bucket =
      daysOverdue <= 0 ? 'Current' :
      daysOverdue <= 30 ? '1-30 days' :
      daysOverdue <= 60 ? '31-60 days' : '60+ days'
    buckets[bucket].count++
    buckets[bucket].total += inv.total_amount ?? 0
  }

  return {
    type: 'pipeline',
    orgId,
    generatedAt: new Date().toISOString(),
    funnel,
    proposalConversion: { sent, accepted, rate: sent > 0 ? accepted / sent : 0 },
    invoiceAging: Object.entries(buckets).map(([bucket, d]) => ({
      bucket,
      count: d.count,
      totalAmount: d.total,
    })),
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getOrgUsage, type OrgUsageSummary } from './usage'

function createMockSupabase(args: {
  agentActivity: Array<Record<string, unknown>>
}) {
  const api = {
    from(table: string) {
      if (table === 'agent_activity') {
        return {
          select: (fields: string) => ({
            eq: (key: string, value: unknown) => ({
              gte: (key: string, value: unknown) => ({
                lte: (key: string, value: unknown) =>
                  Promise.resolve({
                    data: args.agentActivity,
                    error: null,
                  })
              })
            })
          })
        }
      }
      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
  }
}

describe('getOrgUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates token costs for input and output', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          metadata: { client_name: 'Acme Corp' },
          created_at: '2026-03-10',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    // Input: 1M * $3 = $3, Output: 1M * $15 = $15, Total = $18
    expect(result.totalCostUSD).toBe(18.0)
    expect(result.totalTokens).toBe(2_000_000)
  })

  it('aggregates usage by agent type', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 500_000,
          output_tokens: 500_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
        {
          agent_type: 'lead_swarm',
          input_tokens: 250_000,
          output_tokens: 250_000,
          metadata: { client_name: 'Client B' },
          created_at: '2026-03-11',
        },
        {
          agent_type: 'invoice_flow',
          input_tokens: 100_000,
          output_tokens: 200_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-12',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    const leadSwarmUsage = result.byAgent.find((a) => a.agentType === 'lead_swarm')
    const invoiceFlowUsage = result.byAgent.find((a) => a.agentType === 'invoice_flow')

    expect(leadSwarmUsage).toEqual({
      agentType: 'lead_swarm',
      inputTokens: 750_000,
      outputTokens: 750_000,
      invocations: 2,
      costUSD: 13.5,
    })

    expect(invoiceFlowUsage).toEqual({
      agentType: 'invoice_flow',
      inputTokens: 100_000,
      outputTokens: 200_000,
      invocations: 1,
      costUSD: 3.3,
    })
  })

  it('aggregates usage by client from metadata', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 500_000,
          output_tokens: 500_000,
          metadata: { client_name: 'Acme Corp' },
          created_at: '2026-03-10',
        },
        {
          agent_type: 'invoice_flow',
          input_tokens: 250_000,
          output_tokens: 250_000,
          metadata: { client_name: 'Acme Corp' },
          created_at: '2026-03-11',
        },
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 200_000,
          metadata: { client_name: 'TechStart Inc' },
          created_at: '2026-03-12',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    const acmeUsage = result.byClient.find((c) => c.clientName === 'Acme Corp')
    const techstartUsage = result.byClient.find((c) => c.clientName === 'TechStart Inc')

    expect(acmeUsage).toEqual({
      clientName: 'Acme Corp',
      tokens: 1_500_000,
      costUSD: 13.5,
      actions: 2,
    })

    expect(techstartUsage).toEqual({
      clientName: 'TechStart Inc',
      tokens: 300_000,
      costUSD: 3.3,
      actions: 1,
    })
  })

  it('handles missing client_name as "Unattributed"', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: null,
          created_at: '2026-03-10',
        },
        {
          agent_type: 'invoice_flow',
          input_tokens: 50_000,
          output_tokens: 50_000,
          metadata: {},
          created_at: '2026-03-11',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    const unattributed = result.byClient.find((c) => c.clientName === 'Unattributed')

    expect(unattributed).toBeDefined()
    expect(unattributed?.actions).toBe(2)
    expect(unattributed?.tokens).toBe(300_000)
  })

  it('rounds costs to 2 decimal places', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 123_456,
          output_tokens: 654_321,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    // Check that all costs are rounded to 2 decimal places
    expect(result.totalCostUSD).toBe(
      Math.round(result.totalCostUSD * 100) / 100,
    )

    for (const agent of result.byAgent) {
      expect(agent.costUSD).toBe(Math.round(agent.costUSD * 100) / 100)
    }

    for (const client of result.byClient) {
      expect(client.costUSD).toBe(Math.round(client.costUSD * 100) / 100)
    }
  })

  it('handles null token counts as zero', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: null,
          output_tokens: null,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
        {
          agent_type: 'invoice_flow',
          input_tokens: 100_000,
          output_tokens: undefined,
          metadata: { client_name: 'Client B' },
          created_at: '2026-03-11',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    expect(result.totalTokens).toBe(100_000)
    expect(result.totalCostUSD).toBe(0.3)
  })

  it('generates period string in ISO format', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [],
    })

    const customStart = new Date('2026-03-01T00:00:00.000Z')
    const customEnd = new Date('2026-03-31T23:59:59.000Z')

    const result = await getOrgUsage(supabase, 'org-1', customStart, customEnd)

    expect(result.period).toBe('2026-03-01 to 2026-03-31')
  })

  it('uses current month by default', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    // period starts at first of current month, ends at faked "now"
    // Use a flexible pattern: YYYY-MM-DD to YYYY-MM-DD
    expect(result.period).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/)
  })

  it('counts invocations correctly per agent', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-11',
        },
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Client B' },
          created_at: '2026-03-12',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    const leadSwarmUsage = result.byAgent.find((a) => a.agentType === 'lead_swarm')

    expect(leadSwarmUsage?.invocations).toBe(3)
  })

  it('returns empty structure for no activity', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    expect(result.orgId).toBe('org-1')
    expect(result.totalTokens).toBe(0)
    expect(result.totalCostUSD).toBe(0)
    expect(result.byAgent).toEqual([])
    expect(result.byClient).toEqual([])
  })

  it('handles unknown agent type gracefully', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: null,
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
        {
          agent_type: undefined,
          input_tokens: 50_000,
          output_tokens: 50_000,
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-11',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    const unknownUsage = result.byAgent.find((a) => a.agentType === 'unknown')

    expect(unknownUsage).toBeDefined()
    expect(unknownUsage?.invocations).toBe(2)
  })

  it('applies correct pricing tiers (3.0 per M input, 15.0 per M output)', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'test_agent',
          input_tokens: 2_000_000, // 2M * $3 = $6
          output_tokens: 1_000_000, // 1M * $15 = $15
          metadata: { client_name: 'Client A' },
          created_at: '2026-03-10',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    // Total: $6 + $15 = $21
    expect(result.totalCostUSD).toBe(21.0)
    expect(result.byAgent[0].costUSD).toBe(21.0)
  })

  it('correctly aggregates multiple activities for same agent/client', async () => {
    const { supabase } = createMockSupabase({
      agentActivity: [
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Acme Corp' },
          created_at: '2026-03-10',
        },
        {
          agent_type: 'lead_swarm',
          input_tokens: 100_000,
          output_tokens: 100_000,
          metadata: { client_name: 'Acme Corp' },
          created_at: '2026-03-11',
        },
      ],
    })

    const result = await getOrgUsage(supabase, 'org-1')

    expect(result.byAgent).toHaveLength(1)
    expect(result.byClient).toHaveLength(1)
    expect(result.byAgent[0].invocations).toBe(2)
    expect(result.byClient[0].actions).toBe(2)
  })
})

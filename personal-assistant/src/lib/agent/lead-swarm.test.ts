import { describe, expect, it, vi } from 'vitest'
import { classifyInboundLead, qualifyLead, runLeadSwarmTick } from './lead-swarm'

const { classifyMessageMock } = vi.hoisted(() => ({
  classifyMessageMock: vi.fn(),
}))

vi.mock('./classifier', () => ({
  classifyMessage: classifyMessageMock,
}))

interface MessageRow {
  id: string
  org_id: string
  channel: string
  sender: string
  sender_email: string | null
  subject: string | null
  body: string
  received_at: string
  processed?: boolean
  metadata?: Record<string, unknown> | null
}

function createMockSupabase(messages: MessageRow[]) {
  const state = {
    messages: messages.map((message) => ({ ...message, processed: message.processed ?? false })),
    leads: [] as Array<Record<string, unknown>>,
  }

  const api = {
    from(table: string) {
      if (table === 'channel_messages') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              order() {
                return this
              },
              limit() {
                const filtered = state.messages.filter((row) => {
                  const orgMatch = filters.org_id === undefined || row.org_id === filters.org_id
                  const processedMatch =
                    filters.processed === undefined || Boolean(row.processed) === Boolean(filters.processed)
                  return orgMatch && processedMatch
                })
                return Promise.resolve({ data: filtered, error: null })
              },
            }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (filters.id) {
                  const row = state.messages.find((message) => message.id === filters.id)
                  if (row) {
                    Object.assign(row, patch)
                  }
                  return Promise.resolve({ data: null, error: null })
                }
                return this
              },
            }
          },
        }
      }

      if (table === 'leads') {
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq(key: string, value: unknown) {
                const lead = state.leads.find((l) => l[key] === value)
                if (lead) Object.assign(lead, patch)
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
          upsert(payload: Record<string, unknown>) {
            const key = `${String(payload.org_id)}:${String(payload.source_message_id)}`
            const existingIndex = state.leads.findIndex(
              (lead) => `${String(lead.org_id)}:${String(lead.source_message_id)}` === key,
            )

            if (existingIndex >= 0) {
              state.leads[existingIndex] = payload
            } else {
              state.leads.push(payload)
            }

            const leadData = { id: `lead-${state.leads.length}`, ...payload }
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: leadData, error: null })
                  },
                }
              },
            }
          },
        }
      }

      // Catch-all for tables used by downstream functions (agent_configs, approval_queue, etc.)
      const fakeRecord = { id: 'fake-1', org_id: 'org-1', status: 'pending', name: 'mock', action_summary: 'mock' }
      const noopChain: Record<string, unknown> = {
        select() { return noopChain },
        eq() { return noopChain },
        in() { return noopChain },
        order() { return noopChain },
        limit() { return Promise.resolve({ data: [], error: null, count: 0 }) },
        single() { return Promise.resolve({ data: fakeRecord, error: null }) },
        insert() { return noopChain },
        update() { return noopChain },
        upsert() { return noopChain },
      }
      return noopChain
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
    state,
  }
}

describe('classifyInboundLead', () => {
  it('maps classifier categories to lead labels', async () => {
    classifyMessageMock.mockResolvedValueOnce({
      category: 'newsletter',
      significance: 1,
      timeSensitivity: 'none',
      recommendedActions: [],
      reasoning: 'bulk newsletter',
    })

    const { supabase } = createMockSupabase([])
    const classification = await classifyInboundLead(
      supabase,
      {
        id: 'message-1',
        org_id: 'org-1',
        channel: 'gmail',
        sender: 'marketing@example.com',
        sender_email: 'marketing@example.com',
        subject: 'newsletter',
        body: 'our weekly updates',
        received_at: '2026-02-22T10:00:00.000Z',
        metadata: {},
      },
      'org-1',
    )

    expect(classification.label).toBe('spam')
    expect(classification.confidence).toBe(0.1)
  })
})

describe('qualifyLead', () => {
  it('returns hot score for high budget, service fit, and fast timeline', () => {
    const result = qualifyLead({
      estimatedValue: 15000,
      serviceInterest: ['seo'],
      timelineDays: 7,
    })

    expect(result.score).toBe('hot')
    expect(result.points.total).toBe(6)
  })

  it('returns warm score for medium lead profile', () => {
    const result = qualifyLead({
      estimatedValue: 5000,
      serviceInterest: ['web-development'],
      timelineDays: 40,
    })

    expect(result.score).toBe('warm')
    expect(result.points.total).toBe(4)
  })

  it('returns cold score when little qualification data exists', () => {
    const result = qualifyLead({
      estimatedValue: null,
      serviceInterest: [],
      timelineDays: null,
    })

    expect(result.score).toBe('cold')
    expect(result.points.total).toBe(0)
  })
})

describe('runLeadSwarmTick', () => {
  it('processes inbound messages, creates lead rows, and tracks failures per message', async () => {
    classifyMessageMock.mockReset()
    classifyMessageMock.mockImplementation(async (_supabase, message: { id: string }) => {
      if (message.id === 'msg-fail') {
        throw new Error('classifier-failed')
      }

      if (message.id === 'msg-spam') {
        return {
          category: 'spam',
          significance: 1,
          timeSensitivity: 'none',
          recommendedActions: [],
          reasoning: 'spam sender',
        }
      }

      return {
        category: 'lead',
        significance: 9,
        timeSensitivity: 'today',
        recommendedActions: ['reply'],
        reasoning: 'qualified prospect',
      }
    })

    const { supabase, state } = createMockSupabase([
      {
        id: 'msg-lead',
        org_id: 'org-1',
        channel: 'gmail',
        sender: 'Buyer',
        sender_email: 'buyer@example.com',
        subject: 'Need SEO support in 2 weeks',
        body: 'Budget is $15k and we need this ASAP',
        received_at: '2026-02-22T10:00:00.000Z',
        metadata: { direction: 'inbound' },
      },
      {
        id: 'msg-spam',
        org_id: 'org-1',
        channel: 'gmail',
        sender: 'Spam',
        sender_email: 'spam@example.com',
        subject: 'free crypto',
        body: 'click now',
        received_at: '2026-02-22T10:01:00.000Z',
        metadata: { direction: 'inbound' },
      },
      {
        id: 'msg-fail',
        org_id: 'org-1',
        channel: 'gmail',
        sender: 'Unknown',
        sender_email: 'unknown@example.com',
        subject: 'hello',
        body: 'hello',
        received_at: '2026-02-22T10:02:00.000Z',
        metadata: { direction: 'inbound' },
      },
    ])

    const result = await runLeadSwarmTick(supabase, 'org-1', 'cfg-1')

    expect(result).toEqual({
      processed: 2,
      created: 1,
      qualified: 1,
      hot: 1,
      failed: 1,
    })

    expect(state.leads).toHaveLength(1)
    expect(state.messages.find((row) => row.id === 'msg-lead')?.processed).toBe(true)
    expect(state.messages.find((row) => row.id === 'msg-spam')?.processed).toBe(true)
    expect(state.messages.find((row) => row.id === 'msg-fail')?.processed).toBe(false)
  })
})

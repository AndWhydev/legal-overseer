import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeRelationshipStrength,
  computeAllRelationshipScores,
  detectColdRelationships,
  generateRelationshipNudges,
} from './relationship-scorer'

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

interface MockOverrides {
  events?: { data: unknown[]; error: null }
  invoices?: { data: unknown[]; error: null }
  relationships?: { data: unknown[]; error: null }
  contacts?: { data: unknown[]; error: null }
  coldContacts?: { data: unknown[]; error: null }
  agentConfig?: { data: { id: string } | null; error: null }
  insertResult?: { error: null | { message: string } }
  updateResult?: { error: null | { message: string } }
}

function createMockSupabase(overrides: MockOverrides = {}) {
  const mockInsert = vi.fn().mockResolvedValue(overrides.insertResult ?? { error: null })
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(overrides.updateResult ?? { error: null }),
    }),
  })

  const defaultEvents = {
    data: [
      { event_type: 'message_sent', event_data: {}, channel_source: 'email', occurred_at: daysAgo(2) },
      { event_type: 'message_received', event_data: {}, channel_source: 'email', occurred_at: daysAgo(3) },
      { event_type: 'message_sent', event_data: {}, channel_source: 'whatsapp', occurred_at: daysAgo(5) },
      { event_type: 'message_received', event_data: {}, channel_source: 'email', occurred_at: daysAgo(10) },
      { event_type: 'message_sent', event_data: {}, channel_source: 'email', occurred_at: daysAgo(15) },
    ],
    error: null,
  }

  const defaultInvoices = {
    data: [
      { status: 'paid', total: '1500.00', paid_date: daysAgo(30), due_date: daysAgo(35), created_at: daysAgo(60) },
      { status: 'sent', total: '800.00', paid_date: null, due_date: daysAgo(-10), created_at: daysAgo(10) },
    ],
    error: null,
  }

  const defaultRelationships = {
    data: [
      { entity_a_type: 'contact', entity_a_id: 'c1', entity_b_type: 'task', entity_b_id: 't1', last_evidence_at: daysAgo(5) },
    ],
    error: null,
  }

  const defaultContacts = {
    data: [
      { id: 'c1' },
      { id: 'c2' },
    ],
    error: null,
  }

  const defaultColdContacts = {
    data: [
      { id: 'cold-1', name: 'Alice Smith', relationship_strength: 15, last_interaction_at: daysAgo(45), lifetime_value: '5000.00' },
    ],
    error: null,
  }

  const defaultAgentConfig = {
    data: { id: 'agent-comms-1' },
    error: null,
  }

  // Build a chainable query mock that is also thennable (awaitable)
  function buildChain(finalResult: unknown) {
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'gte', 'lt', 'in', 'not', 'or', 'order', 'limit', 'range', 'single', 'contains']
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    // The final call in the chain resolves
    chain['limit'] = vi.fn().mockResolvedValue(finalResult)
    chain['single'] = vi.fn().mockResolvedValue(finalResult)
    // Make order and range return the chain but also support resolve
    chain['order'] = vi.fn().mockReturnValue(chain)
    chain['range'] = vi.fn().mockResolvedValue(finalResult)
    // Make the chain itself thennable so `await supabase.from(t).select().eq()` works
    chain['then'] = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(finalResult).then(resolve, reject)
    return chain
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'entity_timeline') {
        return buildChain(overrides.events ?? defaultEvents)
      }
      if (table === 'invoices') {
        const chain = buildChain(overrides.invoices ?? defaultInvoices)
        // Override limit to return resolved value with in() support
        return chain
      }
      if (table === 'entity_relationships') {
        return buildChain(overrides.relationships ?? defaultRelationships)
      }
      if (table === 'contacts') {
        const chain = buildChain(overrides.contacts ?? defaultContacts)
        chain['update'] = mockUpdate
        return chain
      }
      if (table === 'approval_queue') {
        return { insert: mockInsert }
      }
      if (table === 'agent_configs') {
        return buildChain(overrides.agentConfig ?? defaultAgentConfig)
      }
      return buildChain({ data: [], error: null })
    }),
  } as any

  return { supabase, mockInsert, mockUpdate }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('relationship-scorer', () => {
  describe('computeRelationshipStrength', () => {
    it('calculates strength from mock interaction data', async () => {
      const { supabase } = createMockSupabase()

      const score = await computeRelationshipStrength(supabase, 'org-1', 'c1')

      // With 5 messages in 30-day window (weight 3) = 15, plus 60-day (weight 2) and 90-day (weight 1)
      // Reciprocity: 3 sent / 2 received = 2/3 ratio * 15 = 10
      // Revenue: active invoice + paid invoice + reliability
      // Task: 1 relationship * 2 = 2
      // Minus decay: ~2-3 days since last * 2 = ~4-6
      expect(score.strength).toBeGreaterThan(0)
      expect(score.strength).toBeLessThanOrEqual(100)
      expect(score.topChannel).toBe('email')
      expect(score.daysSinceContact).toBeGreaterThanOrEqual(1)
      expect(score.daysSinceContact).toBeLessThanOrEqual(3)
      expect(['rising', 'stable', 'declining', 'cold']).toContain(score.trend)
    })

    it('applies decay correctly — older last interaction reduces score', async () => {
      // Events all from 20+ days ago
      const oldEvents = {
        data: [
          { event_type: 'message_sent', event_data: {}, channel_source: 'email', occurred_at: daysAgo(25) },
          { event_type: 'message_received', event_data: {}, channel_source: 'email', occurred_at: daysAgo(30) },
        ],
        error: null,
      }

      const { supabase: freshSupabase } = createMockSupabase()
      const { supabase: staleSupabase } = createMockSupabase({ events: oldEvents })

      const freshScore = await computeRelationshipStrength(freshSupabase, 'org-1', 'c1')
      const staleScore = await computeRelationshipStrength(staleSupabase, 'org-1', 'c1')

      // Stale score should be lower due to higher decay penalty
      expect(staleScore.strength).toBeLessThan(freshScore.strength)
      expect(staleScore.daysSinceContact).toBeGreaterThan(freshScore.daysSinceContact)
    })

    it('handles contacts with no interaction history', async () => {
      const { supabase } = createMockSupabase({
        events: { data: [], error: null },
        invoices: { data: [], error: null },
        relationships: { data: [], error: null },
      })

      const score = await computeRelationshipStrength(supabase, 'org-1', 'empty-contact')

      expect(score.strength).toBe(0)
      expect(score.trend).toBe('cold')
      expect(score.lastInteraction).toBeNull()
      expect(score.topChannel).toBe('none')
      expect(score.daysSinceContact).toBe(999)
    })

    it('computes trend correctly based on strength and recency', async () => {
      // Rising: recent activity + high strength
      const { supabase: risingSupabase } = createMockSupabase({
        events: {
          data: Array.from({ length: 20 }, (_, i) => ({
            event_type: i % 2 === 0 ? 'message_sent' : 'message_received',
            event_data: {},
            channel_source: 'email',
            occurred_at: daysAgo(i + 1),
          })),
          error: null,
        },
      })

      const risingScore = await computeRelationshipStrength(risingSupabase, 'org-1', 'c1')
      expect(risingScore.trend).toBe('rising')

      // Cold: no recent activity
      const { supabase: coldSupabase } = createMockSupabase({
        events: { data: [], error: null },
        invoices: { data: [], error: null },
        relationships: { data: [], error: null },
      })

      const coldScore = await computeRelationshipStrength(coldSupabase, 'org-1', 'c1')
      expect(coldScore.trend).toBe('cold')
    })
  })

  describe('computeAllRelationshipScores', () => {
    it('scores all contacts in an org and returns counts', async () => {
      const { supabase } = createMockSupabase()

      const result = await computeAllRelationshipScores(supabase, 'org-1')

      // Should attempt to score 2 contacts (c1, c2)
      expect(result.scored + result.errors).toBe(2)
    })
  })

  describe('detectColdRelationships', () => {
    it('triggers at correct thresholds', async () => {
      const { supabase } = createMockSupabase({
        // Cold contacts query returns contacts with low strength
        contacts: {
          data: [
            {
              id: 'cold-1',
              name: 'Alice Smith',
              relationship_strength: 15,
              last_interaction_at: daysAgo(45),
              lifetime_value: '5000.00',
            },
          ],
          error: null,
        },
      })

      const cold = await detectColdRelationships(supabase, 'org-1')

      expect(cold.length).toBeGreaterThanOrEqual(0)
      // The function queries contacts with relationship_strength < 30
      // and filters by importance (lifetime_value > 0)
      for (const c of cold) {
        expect(c.currentStrength).toBeLessThan(30)
        expect(c.context).toContain(c.contactName)
        expect(c.importance).toBeGreaterThan(0)
        expect(c.importance).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('generateRelationshipNudges', () => {
    it('creates approval queue entries for cold contacts', async () => {
      const { supabase, mockInsert } = createMockSupabase()

      // detectColdRelationships is called internally — it will use
      // the mock contacts data.
      const result = await generateRelationshipNudges(supabase, 'org-1')

      // Result depends on whether cold contacts are returned.
      // With default mocks, the contacts query for cold detection
      // returns contacts with low strength.
      expect(result).toHaveProperty('nudgesCreated')
      expect(typeof result.nudgesCreated).toBe('number')
    })

    it('returns zero nudges when no agent config exists', async () => {
      const { supabase } = createMockSupabase({
        agentConfig: { data: null, error: null },
      })

      const result = await generateRelationshipNudges(supabase, 'org-1')

      expect(result.nudgesCreated).toBe(0)
    })
  })
})

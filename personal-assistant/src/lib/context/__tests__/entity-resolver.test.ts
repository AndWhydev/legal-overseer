import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase client
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOr = vi.fn()
const mockIlike = vi.fn()
const mockContains = vi.fn()
const mockFrom = vi.fn()

const mockSupabase = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

import { resolveEntity, resolveEntityRanked } from '../entity-resolver'

const ORG_ID = 'org-123'

const sezerContact = {
  id: 'c1',
  org_id: ORG_ID,
  slug: 'sezer',
  name: 'Sezer Ozturk',
  type: 'individual',
  emails: ['sezer@example.com'],
  phones: ['0412345678'],
  aliases: ['sezer', 'sez'],
  profile_data: {},
  communication_patterns: {},
}

const andyContact = {
  id: 'c2',
  org_id: ORG_ID,
  slug: 'andy',
  name: 'Andy Wilson',
  type: 'individual',
  emails: ['andy@example.com'],
  phones: ['0498765432'],
  aliases: ['andy'],
  profile_data: {},
  communication_patterns: {},
}

function setupChain(results: Record<string, unknown[] | null>) {
  // Each call to from('contacts') starts a new query chain
  // The resolver calls steps sequentially; we track call count to return different results
  let callCount = 0
  const stepOrder = ['alias', 'email', 'phone', 'name', 'phone_variant']

  mockFrom.mockImplementation(() => {
    const step = stepOrder[callCount] || 'name'
    callCount++
    const data = results[step] ?? []

    // Build a chainable query builder that resolves to { data, error: null }
    const chain: Record<string, unknown> = {}
    const handler = () => chain
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.or = vi.fn().mockReturnValue(chain)
    chain.ilike = vi.fn().mockReturnValue(chain)
    chain.contains = vi.fn().mockReturnValue(chain)
    chain.overlaps = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: data.length > 0 ? data : [], error: null })

    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('entity-resolver', () => {
  describe('resolveEntityRanked', () => {
    it('Step 1: resolves by exact alias match with confidence 1.0', async () => {
      setupChain({ alias: [sezerContact] })

      const results = await resolveEntityRanked('Sezer', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c1')
      expect(results[0].matchConfidence).toBe(1.0)
      expect(results[0].matchStep).toBe('alias')
    })

    it('Step 2: resolves by email match with confidence 0.95', async () => {
      setupChain({ alias: [], email: [sezerContact] })

      const results = await resolveEntityRanked('sezer@example.com', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c1')
      expect(results[0].matchConfidence).toBe(0.95)
      expect(results[0].matchStep).toBe('email')
    })

    it('Step 3: resolves by phone match with confidence 0.90', async () => {
      setupChain({ alias: [], email: [], phone: [sezerContact] })

      const results = await resolveEntityRanked('0412345678', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c1')
      expect(results[0].matchConfidence).toBe(0.90)
      expect(results[0].matchStep).toBe('phone')
    })

    it('Step 4: resolves by partial name match with confidence 0.70', async () => {
      setupChain({ alias: [], email: [], phone: [], name: [sezerContact] })

      const results = await resolveEntityRanked('Sez', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c1')
      expect(results[0].matchConfidence).toBe(0.70)
      expect(results[0].matchStep).toBe('name')
    })

    it('Step 5: resolves by phone variant match with confidence 0.60', async () => {
      setupChain({
        alias: [],
        email: [],
        phone: [],
        name: [],
        phone_variant: [sezerContact],
      })

      const results = await resolveEntityRanked('0412 345 678', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c1')
      expect(results[0].matchConfidence).toBe(0.60)
      expect(results[0].matchStep).toBe('phone_variant')
    })

    it('cascades: skips empty step 1, returns step 2 result', async () => {
      setupChain({ alias: [], email: [andyContact] })

      const results = await resolveEntityRanked('andy@example.com', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].contact.id).toBe('c2')
      expect(results[0].matchStep).toBe('email')
    })

    it('returns empty array when no steps match', async () => {
      setupChain({
        alias: [],
        email: [],
        phone: [],
        name: [],
        phone_variant: [],
      })

      const results = await resolveEntityRanked('nonexistent', ORG_ID)

      expect(results).toEqual([])
    })
  })

  describe('resolveEntity (backward compatible)', () => {
    it('returns Contact[] without ranked metadata', async () => {
      setupChain({ alias: [sezerContact] })

      const results = await resolveEntity('Sezer', ORG_ID)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('c1')
      // Should be plain Contact, not ranked
      expect((results[0] as unknown as Record<string, unknown>).matchConfidence).toBeUndefined()
    })
  })
})

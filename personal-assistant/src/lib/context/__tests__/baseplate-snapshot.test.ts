import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as any

// ─── Knowledge-graph mock (prevents real DB calls) ─────────────────────────

vi.mock('@/lib/rag/knowledge-graph', () => ({
  getKnowledgeGraph: () => ({
    getRelationships: vi.fn().mockResolvedValue([]),
    getTopicsForEntity: vi.fn().mockResolvedValue([]),
  }),
}))

import { getBaseplateSnapshot, type BaseplateSnapshot } from '../baseplate-snapshot'

// ─── Helpers ───────────────────────────────────────────────────────────────

const ORG_ID = 'org-test-123'
const ENTITY_TYPE = 'contact'
const ENTITY_ID = 'contact-uuid-456'
const ENTITY_NAME = 'Sezer Ozturk'

const DOSSIER_MARKDOWN = `## Summary
Sezer is a long-time business partner and freelance designer.

## Key Facts
- Based in Melbourne, Australia
- Specialises in brand identity
- Works with AWU on client projects

## Recent Activity
- Sent invoice #42 on 2026-04-10
- Discussed new project scope on 2026-04-08

## Patterns
- Typically invoices on the 10th of each month
- Prefers WhatsApp for quick messages`

const PROFILE_DATA = {
  recent_events: [{ type: 'message', at: '2026-04-10T12:00:00Z' }],
  relationships: [],
  memories: [{ fact: 'Based in Melbourne', confidence: 0.9 }],
  event_summary: { total: 5, channels: ['whatsapp'], last_event_at: '2026-04-10T12:00:00Z' },
}

function createChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.ilike = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getBaseplateSnapshot', () => {
  describe('dossier path (primary source)', () => {
    it('returns dossierMarkdown and source="dossier" when entity_dossiers has a match', async () => {
      const dossierRow = {
        entity_id: 'entity-node-789',
        entity_name: ENTITY_NAME,
        dossier_markdown: DOSSIER_MARKDOWN,
        last_compiled_at: '2026-04-12T00:00:00Z',
        token_count: 400,
        version: 3,
      }

      // First call: entity_dossiers query
      const dossierChain = createChain(dossierRow)
      mockFrom.mockReturnValueOnce(dossierChain)

      const result = await getBaseplateSnapshot(
        mockSupabase,
        ORG_ID,
        ENTITY_TYPE,
        ENTITY_ID,
        ENTITY_NAME,
      )

      expect(result).not.toBeNull()
      expect(result!.source).toBe('dossier')
      expect(result!.dossierMarkdown).toBe(DOSSIER_MARKDOWN)
      expect(result!.computedAt).toBe('2026-04-12T00:00:00Z')
      // entity_profiles should NOT have been queried
      expect(mockFrom).toHaveBeenCalledTimes(1)
      expect(mockFrom).toHaveBeenCalledWith('entity_dossiers')
    })
  })

  describe('profile fallback path', () => {
    it('falls back to entity_profiles when no dossier found', async () => {
      // First call: entity_dossiers returns null
      const emptyDossierChain = createChain(null)
      mockFrom.mockReturnValueOnce(emptyDossierChain)

      // Second call: entity_profiles returns data
      const profileRow = {
        profile_data: PROFILE_DATA,
        computed_at: '2026-04-09T00:00:00Z',
        valid_until: '2099-01-01T00:00:00Z',
        event_count_at_compute: 5,
      }
      const profileChain = createChain(profileRow)
      mockFrom.mockReturnValueOnce(profileChain)

      const result = await getBaseplateSnapshot(
        mockSupabase,
        ORG_ID,
        ENTITY_TYPE,
        ENTITY_ID,
        ENTITY_NAME,
      )

      expect(result).not.toBeNull()
      expect(result!.source).toBe('profile')
      expect(result!.dossierMarkdown).toBeUndefined()
      expect(result!.profile).toBeDefined()
      expect(result!.profile.memories).toHaveLength(1)
      expect(mockFrom).toHaveBeenCalledWith('entity_dossiers')
      expect(mockFrom).toHaveBeenCalledWith('entity_profiles')
    })

    it('falls back to entity_profiles when entityName is not provided', async () => {
      // Only one call: entity_profiles (dossier query skipped when no name)
      const profileRow = {
        profile_data: PROFILE_DATA,
        computed_at: '2026-04-09T00:00:00Z',
        valid_until: '2099-01-01T00:00:00Z',
        event_count_at_compute: 5,
      }
      const profileChain = createChain(profileRow)
      mockFrom.mockReturnValueOnce(profileChain)

      const result = await getBaseplateSnapshot(
        mockSupabase,
        ORG_ID,
        ENTITY_TYPE,
        ENTITY_ID,
        // no entityName
      )

      expect(result).not.toBeNull()
      expect(result!.source).toBe('profile')
      expect(mockFrom).toHaveBeenCalledTimes(1)
      expect(mockFrom).toHaveBeenCalledWith('entity_profiles')
    })
  })

  describe('neither source found', () => {
    it('returns null when both dossier and profile are missing', async () => {
      // First call: entity_dossiers returns null
      const emptyDossierChain = createChain(null)
      mockFrom.mockReturnValueOnce(emptyDossierChain)

      // Second call: entity_profiles returns null
      const emptyProfileChain = createChain(null)
      mockFrom.mockReturnValueOnce(emptyProfileChain)

      const result = await getBaseplateSnapshot(
        mockSupabase,
        ORG_ID,
        ENTITY_TYPE,
        ENTITY_ID,
        ENTITY_NAME,
      )

      expect(result).toBeNull()
    })
  })

  describe('dossier with empty markdown', () => {
    it('falls back to profile when dossier_markdown is empty', async () => {
      // Dossier exists but markdown is empty string
      const emptyDossierRow = {
        entity_id: 'entity-node-789',
        entity_name: ENTITY_NAME,
        dossier_markdown: '',
        last_compiled_at: '2026-04-12T00:00:00Z',
        token_count: 0,
        version: 1,
      }
      const dossierChain = createChain(emptyDossierRow)
      mockFrom.mockReturnValueOnce(dossierChain)

      // Fallback to profile
      const profileRow = {
        profile_data: PROFILE_DATA,
        computed_at: '2026-04-09T00:00:00Z',
        valid_until: '2099-01-01T00:00:00Z',
        event_count_at_compute: 5,
      }
      const profileChain = createChain(profileRow)
      mockFrom.mockReturnValueOnce(profileChain)

      const result = await getBaseplateSnapshot(
        mockSupabase,
        ORG_ID,
        ENTITY_TYPE,
        ENTITY_ID,
        ENTITY_NAME,
      )

      expect(result).not.toBeNull()
      expect(result!.source).toBe('profile')
    })
  })
})

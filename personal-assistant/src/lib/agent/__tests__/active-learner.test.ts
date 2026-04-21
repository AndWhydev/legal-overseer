/**
 * Active Learner — TDD tests.
 *
 * Covers LEARN-01 through LEARN-04:
 *   - Clarifying question generation (LLM + fallback)
 *   - Clarification WAL entry creation with signal_type='clarification'
 *   - Low-confidence domain scanning with per-entity weekly rate limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AI SDK before importing module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

// Mock the models export
vi.mock('@/lib/ai', () => ({
  models: { fast: 'gemini-flash' },
}))

// Mock logger
vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { generateText } from 'ai'
import {
  generateClarifyingQuestion,
  createClarificationWALEntry,
  fetchLearningPromptItems,
} from '../active-learner'

const mockedGenerateText = vi.mocked(generateText)

// ─── generateClarifyingQuestion (LEARN-01, LEARN-02) ───────────────────────

describe('generateClarifyingQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an LLM-generated single-sentence question when LLM succeeds', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: "I'm preparing Steve West's invoice — is this for the interior redesign or the landscaping project?",
    } as any)

    const result = await generateClarifyingQuestion({
      entityName: 'Steve West',
      ambiguity: 'Which project?',
      context: 'Invoice request',
    })

    expect(result).toBe(
      "I'm preparing Steve West's invoice — is this for the interior redesign or the landscaping project?",
    )
    expect(mockedGenerateText).toHaveBeenCalledTimes(1)
  })

  it('trims whitespace from LLM output', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: '   Is this for project A or project B?   \n',
    } as any)

    const result = await generateClarifyingQuestion({
      entityName: 'Alice',
      ambiguity: 'Which project',
      context: 'Invoice',
    })

    expect(result).toBe('Is this for project A or project B?')
  })

  it('passes entity name, ambiguity, and context to the LLM prompt', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Question?',
    } as any)

    await generateClarifyingQuestion({
      entityName: 'Jane Doe',
      ambiguity: 'date ambiguity',
      context: 'scheduling',
    })

    const call = mockedGenerateText.mock.calls[0][0] as any
    expect(call.prompt).toContain('Jane Doe')
    expect(call.prompt).toContain('date ambiguity')
    expect(call.prompt).toContain('scheduling')
  })

  it('includes dossier summary when provided', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Question?',
    } as any)

    await generateClarifyingQuestion({
      entityName: 'Alice',
      ambiguity: 'x',
      context: 'y',
      dossierSummary: 'Prefers email over phone',
    })

    const call = mockedGenerateText.mock.calls[0][0] as any
    expect(call.prompt).toContain('Prefers email over phone')
  })

  it('returns null when LLM throws an error', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API timeout'))

    const result = await generateClarifyingQuestion({
      entityName: 'Alice',
      ambiguity: 'x',
      context: 'y',
    })

    expect(result).toBeNull()
  })

  it('uses gateway(models.fast) for the LLM call', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: 'Q?',
    } as any)

    await generateClarifyingQuestion({
      entityName: 'Alice',
      ambiguity: 'x',
      context: 'y',
    })

    const call = mockedGenerateText.mock.calls[0][0] as any
    // gateway mock is passthrough, so model should be 'gemini-flash'
    expect(call.model).toBe('gemini-flash')
  })
})

// ─── createClarificationWALEntry (LEARN-03) ────────────────────────────────

describe('createClarificationWALEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a knowledge_log row with signal_type="clarification" and returns true', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as any

    const result = await createClarificationWALEntry(
      mockSupabase,
      'org-1',
      ['ent-1'],
      'It is for the interior redesign.',
      {
        question: "Is this for the interior redesign or landscaping?",
        entityName: 'Steve West',
        ambiguity: 'Which project?',
      },
    )

    expect(result).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('knowledge_log')
    expect(insertSpy).toHaveBeenCalledTimes(1)
    const row = insertSpy.mock.calls[0][0]
    expect(row.signal_type).toBe('clarification')
    expect(row.org_id).toBe('org-1')
    expect(row.entity_ids).toEqual(['ent-1'])
  })

  it('includes both the question and the user reply in the row content', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as any

    await createClarificationWALEntry(
      mockSupabase,
      'org-1',
      ['ent-1'],
      'Interior redesign',
      {
        question: 'Is this for interior redesign or landscaping?',
        entityName: 'Steve West',
        ambiguity: 'Which project?',
      },
    )

    const row = insertSpy.mock.calls[0][0]
    expect(row.content).toContain('Steve West')
    expect(row.content).toContain('interior redesign or landscaping')
    expect(row.content).toContain('Interior redesign')
  })

  it('sets confidence to 0.95 (high — user explicitly confirmed)', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as any

    await createClarificationWALEntry(
      mockSupabase,
      'org-1',
      ['ent-1'],
      'reply',
      { question: 'q', entityName: 'e', ambiguity: 'a' },
    )

    const row = insertSpy.mock.calls[0][0]
    expect(row.confidence).toBe(0.95)
  })

  it('returns false when supabase insert returns an error', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: { message: 'db error' } })
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    } as any

    const result = await createClarificationWALEntry(
      mockSupabase,
      'org-1',
      ['ent-1'],
      'reply',
      { question: 'q', entityName: 'e', ambiguity: 'a' },
    )

    expect(result).toBe(false)
  })

  it('returns false when supabase throws', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('connection lost')
      }),
    } as any

    const result = await createClarificationWALEntry(
      mockSupabase,
      'org-1',
      ['ent-1'],
      'reply',
      { question: 'q', entityName: 'e', ambiguity: 'a' },
    )

    expect(result).toBe(false)
  })
})

// ─── fetchLearningPromptItems (LEARN-04) ───────────────────────────────────

describe('fetchLearningPromptItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Chainable thenable: lets the production code chain any number of
  // .eq/.gte/.in/.limit calls and have the whole object resolve to the
  // configured response. Decouples tests from the exact query shape.
  function makeChainable(response: unknown) {
    const resolved: any = Promise.resolve(response)
    const chain: any = {
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: resolved.then.bind(resolved),
      catch: resolved.catch.bind(resolved),
      finally: resolved.finally.bind(resolved),
    }
    return chain
  }

  function makeSupabaseFor(
    dossiers: Array<{
      entity_id: string
      entity_name: string
      schema_json: Record<string, unknown>
    }>,
    recentLearningPrompts: string[] = [], // entity_ids that had a recent prompt
  ) {
    // fetchRecentLearningPromptEntityIds returns rows as `data: [{entity_id}]`
    const recentRows = recentLearningPrompts.map((id) => ({ entity_id: id }))
    const from = vi.fn((table: string) => {
      if (table === 'entity_dossiers') {
        return {
          select: vi.fn(() => makeChainable({ data: dossiers, error: null })),
        }
      }
      if (table === 'brain_alerts') {
        return {
          select: vi.fn(() => makeChainable({ data: recentRows, error: null })),
        }
      }
      return { select: vi.fn(() => makeChainable({ data: [], error: null })) }
    })
    return { from } as any
  }

  it('returns learning prompts for low-confidence domains (confidence < 0.5)', async () => {
    const supabase = makeSupabaseFor([
      {
        entity_id: 'ent-1',
        entity_name: 'Alice',
        schema_json: { domain_confidence: { financial: 0.3, operational: 0.8 } },
      },
    ])

    const items = await fetchLearningPromptItems(supabase, 'org-1')

    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toContain('Alice')
    expect(items[0]).toContain('financial')
  })

  it('skips domains with confidence >= 0.5', async () => {
    const supabase = makeSupabaseFor([
      {
        entity_id: 'ent-1',
        entity_name: 'Alice',
        schema_json: { domain_confidence: { financial: 0.9, operational: 0.7 } },
      },
    ])

    const items = await fetchLearningPromptItems(supabase, 'org-1')
    expect(items).toEqual([])
  })

  it('skips entities that had a learning_prompt alert within the last 7 days', async () => {
    const supabase = makeSupabaseFor(
      [
        {
          entity_id: 'ent-1',
          entity_name: 'Alice',
          schema_json: { domain_confidence: { financial: 0.3 } },
        },
      ],
      ['ent-1'], // ent-1 has a recent learning_prompt
    )

    const items = await fetchLearningPromptItems(supabase, 'org-1')
    expect(items).toEqual([])
  })

  it('returns an empty array when no entity_dossiers are found', async () => {
    const supabase = makeSupabaseFor([])
    const items = await fetchLearningPromptItems(supabase, 'org-1')
    expect(items).toEqual([])
  })

  it('returns an empty array on supabase error', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('connection lost')
      }),
    } as any

    const items = await fetchLearningPromptItems(mockSupabase, 'org-1')
    expect(items).toEqual([])
  })

  it('caps results at maximum of 5 items', async () => {
    const dossiers = Array.from({ length: 10 }, (_, i) => ({
      entity_id: `ent-${i}`,
      entity_name: `Entity ${i}`,
      schema_json: { domain_confidence: { financial: 0.2, operational: 0.3 } },
    }))
    const supabase = makeSupabaseFor(dossiers)

    const items = await fetchLearningPromptItems(supabase, 'org-1')
    expect(items.length).toBeLessThanOrEqual(5)
  })

  it('handles missing domain_confidence gracefully', async () => {
    const supabase = makeSupabaseFor([
      {
        entity_id: 'ent-1',
        entity_name: 'Alice',
        schema_json: {}, // no domain_confidence at all
      },
    ])

    const items = await fetchLearningPromptItems(supabase, 'org-1')
    expect(items).toEqual([])
  })
})

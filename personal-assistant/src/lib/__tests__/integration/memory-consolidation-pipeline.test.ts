import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reflectOnEvent } from '@/lib/agent/reflection'
import { consolidateMemories } from '@/lib/agent/memory-consolidation'

const { anthropicCreateMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return {
      messages: {
        create: anthropicCreateMock,
      },
    }
  }

  return {
    default: MockAnthropic,
  }
})

type MemoryRow = {
  id: string
  org_id: string
  content: string
  category: string
  confidence: number
  entity_ids: string[]
  created_at: string
  source?: string
  is_active: boolean
  superseded_by?: string
}

function createSemanticMemoriesSupabase(seed: MemoryRow[] = []) {
  const state = {
    memories: [...seed],
  }

  const supabase = {
    from(table: string) {
      if (table !== 'semantic_memories') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select(_cols?: string, options?: { count?: 'exact'; head?: boolean }) {
          const filters: Record<string, unknown> = {}

          const query = {
            eq(key: string, value: unknown) {
              filters[key] = value
              return query
            },
            ilike(key: string, value: unknown) {
              filters[`ilike:${key}`] = value
              return query
            },
            contains(key: string, value: unknown) {
              filters[`contains:${key}`] = value
              return query
            },
            order() {
              return query
            },
            limit() {
              return query
            },
            then(resolve: (value: unknown) => void) {
              const filtered = state.memories.filter((row) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (k.startsWith('ilike:')) {
                    const col = k.replace('ilike:', '')
                    const rowValue = String((row as any)[col] ?? '').toLowerCase()
                    const expected = String(v ?? '').toLowerCase()
                    if (rowValue !== expected) return false
                    continue
                  }

                  if (k.startsWith('contains:')) {
                    const col = k.replace('contains:', '')
                    const expected = Array.isArray(v) ? v : []
                    const rowValue = (row as any)[col]
                    if (!Array.isArray(rowValue)) return false
                    const hasAll = expected.every((item) => rowValue.includes(item))
                    if (!hasAll) return false
                    continue
                  }

                  if ((row as any)[k] !== v) return false
                }

                return true
              })

              if (options?.count === 'exact' && options?.head) {
                return resolve({ data: null, error: null, count: filtered.length })
              }

              return resolve({ data: filtered, error: null })
            },
          }

          return query
        },

        insert(payload: Record<string, unknown>) {
          const record: MemoryRow = {
            id: String(payload.id ?? `mem-${state.memories.length + 1}`),
            org_id: String(payload.org_id),
            content: String(payload.content),
            category: String(payload.category ?? 'domain'),
            confidence: Number(payload.confidence ?? 0.7),
            entity_ids: (payload.entity_ids as string[]) ?? [],
            source: String(payload.source ?? 'test'),
            is_active: payload.is_active !== false,
            created_at: String(payload.created_at ?? new Date().toISOString()),
          }
          state.memories.push(record)
          return Promise.resolve({ error: null })
        },

        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {}

          const query = {
            in(key: string, values: unknown[]) {
              filters[`in:${key}`] = values
              return query
            },
            eq(key: string, value: unknown) {
              filters[key] = value
              return query
            },
            then(resolve: (value: unknown) => void) {
              const ids = (filters['in:id'] as string[]) ?? null
              for (const memory of state.memories) {
                if (ids && !ids.includes(memory.id)) continue
                if (filters.org_id && memory.org_id !== filters.org_id) continue
                Object.assign(memory, patch)
              }
              return resolve({ data: null, error: null })
            },
          }

          return query
        },
      }
    },
  }

  return {
    supabase,
    state,
  }
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  anthropicCreateMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('Memory Consolidation Pipeline Integration', () => {
  it('reflection extracts facts from message content', async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              content: 'Client prefers weekly status updates by email.',
              category: 'workflow',
              confidence: 0.93,
            },
          ]),
        },
      ],
    })

    const { supabase, state } = createSemanticMemoriesSupabase()

    const facts = await reflectOnEvent(supabase as any, 'org-1', {
      eventType: 'message_received',
      eventData: {
        content: 'Please send weekly status updates by email.',
      },
      entityType: 'contact',
      entityId: 'contact-1',
      entityName: 'Steve West',
    })

    expect(facts).toHaveLength(1)
    expect(facts[0]).toEqual(
      expect.objectContaining({
        content: 'Client prefers weekly status updates by email.',
        category: 'workflow',
        confidence: 0.93,
        entityIds: ['contact-1'],
      }),
    )
    expect(state.memories).toHaveLength(1)
  })

  it('consolidation deduplicates identical memories', async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            keep: ['mem-new'],
            deactivate: ['mem-old'],
            merge: [],
          }),
        },
      ],
    })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-old',
        org_id: 'org-1',
        content: 'Steve prefers Monday check-ins.',
        category: 'workflow',
        confidence: 0.7,
        entity_ids: ['contact-1'],
        created_at: '2026-02-01T10:00:00.000Z',
        is_active: true,
      },
      {
        id: 'mem-new',
        org_id: 'org-1',
        content: 'Steve prefers Monday check-ins.',
        category: 'workflow',
        confidence: 0.9,
        entity_ids: ['contact-1'],
        created_at: '2026-03-01T10:00:00.000Z',
        is_active: true,
      },
    ])

    const result = await consolidateMemories(supabase as any, 'org-1')

    expect(result).toEqual({ merged: 0, deactivated: 1, kept: 1 })
    expect(state.memories.find((m) => m.id === 'mem-old')?.is_active).toBe(false)
    expect(state.memories.find((m) => m.id === 'mem-old')?.superseded_by).toBe('consolidation')
  })

  it('dry-run consolidation reports actions without mutating memories', async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            keep: ['mem-new'],
            deactivate: ['mem-old'],
            merge: [
              {
                source_ids: ['mem-old', 'mem-new'],
                merged_content: 'Client prefers concise weekly updates on Mondays.',
                confidence: 0.9,
              },
            ],
          }),
        },
      ],
    })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-old',
        org_id: 'org-1',
        content: 'Client likes weekly updates.',
        category: 'workflow',
        confidence: 0.7,
        entity_ids: ['contact-1'],
        created_at: '2026-02-01T10:00:00.000Z',
        is_active: true,
      },
      {
        id: 'mem-new',
        org_id: 'org-1',
        content: 'Client prefers concise updates.',
        category: 'workflow',
        confidence: 0.9,
        entity_ids: ['contact-1'],
        created_at: '2026-03-01T10:00:00.000Z',
        is_active: true,
      },
    ])

    const result = await consolidateMemories(supabase as any, 'org-1', { dryRun: true })

    expect(result).toEqual({ merged: 1, deactivated: 1, kept: 1 })
    expect(state.memories).toHaveLength(2)
    expect(state.memories.every((memory) => memory.is_active)).toBe(true)
    expect(state.memories.some((memory) => memory.content.includes('concise weekly updates on Mondays'))).toBe(false)
  })

  it('consolidation merges overlapping memories', async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            keep: [],
            deactivate: [],
            merge: [
              {
                source_ids: ['mem-1', 'mem-2'],
                merged_content: 'Steve prefers weekly progress emails on Mondays.',
                confidence: 0.88,
              },
            ],
          }),
        },
      ],
    })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-1',
        org_id: 'org-1',
        content: 'Steve likes weekly progress emails.',
        category: 'workflow',
        confidence: 0.8,
        entity_ids: ['contact-1'],
        created_at: '2026-03-01T10:00:00.000Z',
        is_active: true,
      },
      {
        id: 'mem-2',
        org_id: 'org-1',
        content: 'Send updates on Mondays.',
        category: 'workflow',
        confidence: 0.82,
        entity_ids: ['contact-1'],
        created_at: '2026-03-02T10:00:00.000Z',
        is_active: true,
      },
    ])

    const result = await consolidateMemories(supabase as any, 'org-1')

    expect(result.merged).toBe(1)
    expect(state.memories.some((m) => m.content === 'Steve prefers weekly progress emails on Mondays.')).toBe(true)
    expect(state.memories.find((m) => m.id === 'mem-1')?.is_active).toBe(false)
    expect(state.memories.find((m) => m.id === 'mem-2')?.is_active).toBe(false)
  })

  it('consolidation supersedes outdated memories', async () => {
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            keep: ['mem-new'],
            deactivate: ['mem-old'],
            merge: [],
          }),
        },
      ],
    })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-old',
        org_id: 'org-1',
        content: 'Client prefers monthly reporting.',
        category: 'workflow',
        confidence: 0.9,
        entity_ids: ['contact-2'],
        created_at: '2025-12-01T00:00:00.000Z',
        is_active: true,
      },
      {
        id: 'mem-new',
        org_id: 'org-1',
        content: 'Client now prefers weekly reporting.',
        category: 'workflow',
        confidence: 0.95,
        entity_ids: ['contact-2'],
        created_at: '2026-03-01T00:00:00.000Z',
        is_active: true,
      },
    ])

    const result = await consolidateMemories(supabase as any, 'org-1')

    expect(result.deactivated).toBe(1)
    expect(state.memories.find((m) => m.id === 'mem-old')?.is_active).toBe(false)
    expect(state.memories.find((m) => m.id === 'mem-old')?.superseded_by).toBe('consolidation')
  })

  it('full pipeline: message -> reflection -> consolidation', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                content: 'Steve prefers concise weekly reports.',
                category: 'workflow',
                confidence: 0.9,
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              keep: ['mem-existing'],
              deactivate: [],
              merge: [
                {
                  source_ids: ['mem-existing', 'mem-2'],
                  merged_content: 'Steve prefers concise weekly reports sent every Monday.',
                  confidence: 0.9,
                },
              ],
            }),
          },
        ],
      })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-existing',
        org_id: 'org-1',
        content: 'Steve prefers weekly reports.',
        category: 'workflow',
        confidence: 0.8,
        entity_ids: ['contact-1'],
        created_at: '2026-02-01T00:00:00.000Z',
        is_active: true,
      },
    ])

    const extracted = await reflectOnEvent(supabase as any, 'org-1', {
      eventType: 'message_received',
      eventData: {
        content: 'Please keep reports concise and send every Monday.',
      },
      entityType: 'contact',
      entityId: 'contact-1',
      entityName: 'Steve West',
    })

    const consolidation = await consolidateMemories(supabase as any, 'org-1')

    expect(extracted).toHaveLength(1)
    expect(consolidation.merged).toBe(1)
    expect(state.memories.some((m) => m.content.includes('concise weekly reports sent every Monday'))).toBe(true)
  })
})

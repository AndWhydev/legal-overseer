import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapCategoryToSignalType,
  emitToWAL,
  readWALTail,
} from '../wal-emitter'
import type { MemoryCategory } from '@/lib/memory-palace/types'
import type { SignalType, KnowledgeLogEntry } from '../types'

// ─── Supabase Mock ──────────────────────────────────────────────────────────

function createMockSupabase(overrides?: {
  insertResult?: { data: unknown; error: unknown }
  selectResult?: { data: unknown; error: unknown }
}) {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(
      overrides?.selectResult ?? { data: [], error: null },
    ),
  }

  const insertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        overrides?.insertResult ?? {
          data: {
            id: 'wal-001',
            org_id: 'org-1',
            entity_ids: ['ent-1'],
            signal_type: 'message',
            content: 'test content',
            confidence: 0.8,
            source_memory_id: 'mem-1',
            source_thread_id: null,
            consolidated_at: null,
            created_at: '2026-04-11T00:00:00Z',
          } satisfies KnowledgeLogEntry,
          error: null,
        },
      ),
    }),
  }

  const from = vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnValue(insertChain),
    select: vi.fn().mockReturnValue(selectChain),
  })

  return { from, _insertChain: insertChain, _selectChain: selectChain }
}

// ─── mapCategoryToSignalType ────────────────────────────────────────────────

describe('mapCategoryToSignalType', () => {
  const mappings: [MemoryCategory, SignalType][] = [
    ['conversation', 'message'],
    ['decision', 'decision'],
    ['pattern', 'pattern'],
    ['fact', 'message'],
    ['relationship', 'relationship'],
    ['pricing', 'pricing'],
    ['convention', 'pattern'],
    ['fiduciary_constraint', 'fiduciary'],
  ]

  it.each(mappings)(
    'maps %s -> %s',
    (category, expectedSignalType) => {
      expect(mapCategoryToSignalType(category)).toBe(expectedSignalType)
    },
  )
})

// ─── emitToWAL ──────────────────────────────────────────────────────────────

describe('emitToWAL', () => {
  it('inserts into knowledge_log and returns the entry', async () => {
    const mockEntry: KnowledgeLogEntry = {
      id: 'wal-001',
      org_id: 'org-1',
      entity_ids: ['ent-1'],
      signal_type: 'message',
      content: 'test content',
      confidence: 0.8,
      source_memory_id: 'mem-1',
      source_thread_id: null,
      consolidated_at: null,
      created_at: '2026-04-11T00:00:00Z',
    }

    const supabase = createMockSupabase({
      insertResult: { data: mockEntry, error: null },
    })

    const result = await emitToWAL(supabase as any, {
      org_id: 'org-1',
      entity_ids: ['ent-1'],
      signal_type: 'message',
      content: 'test content',
      confidence: 0.8,
      source_memory_id: 'mem-1',
    })

    expect(supabase.from).toHaveBeenCalledWith('knowledge_log')
    expect(result).toEqual(mockEntry)
  })

  it('returns null and does not throw on supabase error', async () => {
    const supabase = createMockSupabase({
      insertResult: { data: null, error: { message: 'insert failed' } },
    })

    const result = await emitToWAL(supabase as any, {
      org_id: 'org-1',
      entity_ids: [],
      signal_type: 'message',
      content: 'test',
      confidence: 0.5,
    })

    expect(result).toBeNull()
  })

  it('returns null and does not throw on unexpected exception', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('unexpected')
      }),
    }

    const result = await emitToWAL(supabase as any, {
      org_id: 'org-1',
      entity_ids: [],
      signal_type: 'message',
      content: 'test',
      confidence: 0.5,
    })

    expect(result).toBeNull()
  })
})

// ─── readWALTail ────────────────────────────────────────────────────────────

describe('readWALTail', () => {
  it('queries knowledge_log with consolidated_at IS NULL filter', async () => {
    const entries: KnowledgeLogEntry[] = [
      {
        id: 'wal-002',
        org_id: 'org-1',
        entity_ids: ['ent-1'],
        signal_type: 'decision',
        content: 'decided something',
        confidence: 0.9,
        source_memory_id: null,
        source_thread_id: null,
        consolidated_at: null,
        created_at: '2026-04-11T01:00:00Z',
      },
    ]

    const supabase = createMockSupabase({
      selectResult: { data: entries, error: null },
    })

    const result = await readWALTail(supabase as any, {
      org_id: 'org-1',
    })

    expect(supabase.from).toHaveBeenCalledWith('knowledge_log')

    const chain = supabase.from.mock.results[0].value
    const selectReturn = chain.select.mock.results[0].value

    // Verify eq was called with org_id filter
    expect(selectReturn.eq).toHaveBeenCalledWith('org_id', 'org-1')
    // Verify is was called for consolidated_at IS NULL
    expect(selectReturn.is).toHaveBeenCalledWith('consolidated_at', null)
    // Verify ordering
    expect(selectReturn.order).toHaveBeenCalledWith('created_at', { ascending: false })
    // Default limit of 20
    expect(selectReturn.limit).toHaveBeenCalledWith(20)

    expect(result).toEqual(entries)
  })

  it('applies since filter when provided', async () => {
    const supabase = createMockSupabase({
      selectResult: { data: [], error: null },
    })

    await readWALTail(supabase as any, {
      org_id: 'org-1',
      since: '2026-04-10T00:00:00Z',
      limit: 10,
    })

    const chain = supabase.from.mock.results[0].value
    const selectReturn = chain.select.mock.results[0].value

    expect(selectReturn.gte).toHaveBeenCalledWith('created_at', '2026-04-10T00:00:00Z')
    expect(selectReturn.limit).toHaveBeenCalledWith(10)
  })

  it('returns empty array on error', async () => {
    const supabase = createMockSupabase({
      selectResult: { data: null, error: { message: 'query failed' } },
    })

    const result = await readWALTail(supabase as any, {
      org_id: 'org-1',
    })

    expect(result).toEqual([])
  })
})

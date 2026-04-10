/**
 * Intake Clerk — TDD tests.
 *
 * Tests signal-to-domain routing, fact extraction, and WAL batch processing.
 * LLM calls and Supabase are mocked; BullMQ queues use simple spy objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry, SignalType, DomainType } from '../types'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

// Mock wal-emitter
vi.mock('../wal-emitter', () => ({
  readWALTail: vi.fn(),
}))

import { generateText } from 'ai'
import { readWALTail } from '../wal-emitter'
import {
  signalToDomain,
  extractFactsFromBatch,
  processWALBatch,
  type ExtractedFact,
} from '../intake-clerk'

const mockedGenerateText = vi.mocked(generateText)
const mockedReadWALTail = vi.mocked(readWALTail)

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<KnowledgeLogEntry> = {}): KnowledgeLogEntry {
  return {
    id: overrides.id ?? 'entry-1',
    org_id: 'org-1',
    entity_ids: ['entity-1'],
    signal_type: 'message',
    content: 'Alice paid $500 for consulting',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeQueue() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  }
}

function makeSupabase(entries: KnowledgeLogEntry[] = []) {
  const updateMock = {
    in: vi.fn().mockResolvedValue({ error: null }),
  }
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(updateMock),
    }),
    _updateMock: updateMock,
  }
}

// ─── signalToDomain ────────────────────────────────────────────────────────

describe('signalToDomain', () => {
  const mappings: [SignalType, DomainType][] = [
    ['message', 'operational'],
    ['invoice', 'financial'],
    ['calendar', 'operational'],
    ['pattern', 'behavioral'],
    ['correction', 'operational'],
    ['decision', 'operational'],
    ['relationship', 'relational'],
    ['pricing', 'financial'],
    ['fiduciary', 'financial'],
  ]

  it.each(mappings)('maps %s -> %s', (signal, expected) => {
    expect(signalToDomain(signal)).toBe(expected)
  })
})

// ─── extractFactsFromBatch ─────────────────────────────────────────────────

describe('extractFactsFromBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array for empty entries', async () => {
    const result = await extractFactsFromBatch([])
    expect(result).toEqual([])
    expect(mockedGenerateText).not.toHaveBeenCalled()
  })

  it('extracts structured facts from LLM response', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid $500 for consulting", "domain": "financial"}',
        '{"entity_name": "Bob", "fact": "Scheduled meeting for Monday", "domain": "operational"}',
      ].join('\n'),
    } as any)

    const entries = [
      makeEntry({ id: 'e1', content: 'Alice paid $500 for consulting' }),
      makeEntry({ id: 'e2', content: 'Bob scheduled a meeting for Monday' }),
    ]

    const result = await extractFactsFromBatch(entries)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      entity_name: 'Alice',
      fact: 'Paid $500 for consulting',
      domain: 'financial',
    })
    expect(result[1]).toEqual({
      entity_name: 'Bob',
      fact: 'Scheduled meeting for Monday',
      domain: 'operational',
    })
  })

  it('skips malformed JSON lines', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid $500", "domain": "financial"}',
        'this is not valid json',
        '{"entity_name": "Bob", "fact": "Met on Tuesday", "domain": "relational"}',
      ].join('\n'),
    } as any)

    const entries = [makeEntry()]
    const result = await extractFactsFromBatch(entries)

    expect(result).toHaveLength(2)
    expect(result[0].entity_name).toBe('Alice')
    expect(result[1].entity_name).toBe('Bob')
  })

  it('skips lines missing required fields', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid $500", "domain": "financial"}',
        '{"entity_name": "Bob"}',
        '{"fact": "something", "domain": "operational"}',
      ].join('\n'),
    } as any)

    const entries = [makeEntry()]
    const result = await extractFactsFromBatch(entries)

    expect(result).toHaveLength(1)
    expect(result[0].entity_name).toBe('Alice')
  })

  it('returns empty array on LLM failure', async () => {
    mockedGenerateText.mockRejectedValueOnce(new Error('API error'))

    const entries = [makeEntry()]
    const result = await extractFactsFromBatch(entries)

    expect(result).toEqual([])
  })
})

// ─── processWALBatch ───────────────────────────────────────────────────────

describe('processWALBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zero counts when no WAL entries exist', async () => {
    mockedReadWALTail.mockResolvedValueOnce([])

    const supabase = makeSupabase()
    const queues = {
      financial: makeQueue(),
      relational: makeQueue(),
      operational: makeQueue(),
      behavioral: makeQueue(),
    }

    const result = await processWALBatch(supabase as any, 'org-1', queues as any)

    expect(result).toEqual({ processed: 0, routed: 0 })
  })

  it('processes entries, routes facts to domain queues, and marks consolidated', async () => {
    const entries = [
      makeEntry({ id: 'e1', content: 'Alice paid invoice #123' }),
      makeEntry({ id: 'e2', content: 'Meeting with Bob at 3pm' }),
    ]
    mockedReadWALTail.mockResolvedValueOnce(entries)

    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid invoice #123", "domain": "financial"}',
        '{"entity_name": "Bob", "fact": "Meeting at 3pm", "domain": "operational"}',
      ].join('\n'),
    } as any)

    const supabase = makeSupabase()
    const queues = {
      financial: makeQueue(),
      relational: makeQueue(),
      operational: makeQueue(),
      behavioral: makeQueue(),
    }

    const result = await processWALBatch(supabase as any, 'org-1', queues as any)

    expect(result.processed).toBe(2)
    expect(result.routed).toBe(2)

    // Financial queue got Alice's fact
    expect(queues.financial.add).toHaveBeenCalledTimes(1)
    expect(queues.financial.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        org_id: 'org-1',
        entity_id: 'Alice',
        domain: 'financial',
      }),
    )

    // Operational queue got Bob's fact
    expect(queues.operational.add).toHaveBeenCalledTimes(1)
    expect(queues.operational.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        org_id: 'org-1',
        entity_id: 'Bob',
        domain: 'operational',
      }),
    )

    // WAL entries marked as consolidated
    expect(supabase.from).toHaveBeenCalledWith('knowledge_log')
    expect(supabase._updateMock.in).toHaveBeenCalledWith('id', ['e1', 'e2'])
  })

  it('groups multiple facts for the same entity+domain into one job', async () => {
    const entries = [
      makeEntry({ id: 'e1', content: 'Alice paid $500' }),
      makeEntry({ id: 'e2', content: 'Alice paid $300' }),
    ]
    mockedReadWALTail.mockResolvedValueOnce(entries)

    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid $500", "domain": "financial"}',
        '{"entity_name": "Alice", "fact": "Paid $300", "domain": "financial"}',
      ].join('\n'),
    } as any)

    const supabase = makeSupabase()
    const queues = {
      financial: makeQueue(),
      relational: makeQueue(),
      operational: makeQueue(),
      behavioral: makeQueue(),
    }

    const result = await processWALBatch(supabase as any, 'org-1', queues as any)

    // Both facts for Alice/financial grouped into one job
    expect(queues.financial.add).toHaveBeenCalledTimes(1)
    expect(queues.financial.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        org_id: 'org-1',
        entity_id: 'Alice',
        domain: 'financial',
        fact_ids: expect.arrayContaining([expect.any(String)]),
      }),
    )
    expect(result.routed).toBe(1) // one grouped job
  })

  it('still marks WAL entries as consolidated even when no facts extracted', async () => {
    const entries = [makeEntry({ id: 'e1' })]
    mockedReadWALTail.mockResolvedValueOnce(entries)

    // LLM returns no parseable facts
    mockedGenerateText.mockResolvedValueOnce({ text: '' } as any)

    const supabase = makeSupabase()
    const queues = {
      financial: makeQueue(),
      relational: makeQueue(),
      operational: makeQueue(),
      behavioral: makeQueue(),
    }

    const result = await processWALBatch(supabase as any, 'org-1', queues as any)

    expect(result.processed).toBe(1)
    expect(result.routed).toBe(0)

    // Entries still marked consolidated — they were processed, just yielded nothing
    expect(supabase._updateMock.in).toHaveBeenCalledWith('id', ['e1'])
  })
})

/**
 * Surprise Surfacer — TDD tests.
 *
 * Verifies that high-surprise knowledge_log entries are surfaced as
 * proactive insights, formatted per channel, and marked as surfaced
 * to prevent repetition.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock Supabase ──────────────────────────────────────────────────────────

function createMockSupabase(overrides: {
  walRows?: Record<string, unknown>[]
  dossierRows?: Record<string, unknown>[]
  updateError?: Error | null
} = {}) {
  const {
    walRows = [],
    dossierRows = [],
    updateError = null,
  } = overrides

  const updateFn = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: updateError }),
  })

  const fromFn = vi.fn((table: string) => {
    if (table === 'knowledge_log') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            overlaps: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({ data: walRows, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: updateFn,
      }
    }
    if (table === 'entity_dossiers') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: dossierRows, error: null }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: fromFn, _updateFn: updateFn }
}

// ─── Mock predictive-coding ─────────────────────────────────────────────────

vi.mock('../predictive-coding', () => ({
  scoreSurprise: vi.fn(),
  SURPRISE_THRESHOLD: 0.3,
}))

import { scoreSurprise } from '../predictive-coding'
import type { SurpriseScore } from '../types'

const mockedScoreSurprise = vi.mocked(scoreSurprise)

// ─── Import module under test ───────────────────────────────────────────────

import {
  getSurpriseFacts,
  formatSurpriseForChannel,
  PROACTIVE_SURPRISE_THRESHOLD,
} from '../surprise-surfacer'

// ─── Test Data ──────────────────────────────────────────────────────────────

function makeWalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? 'wal-1',
    org_id: 'org-1',
    entity_ids: overrides.entity_ids ?? ['entity-1'],
    signal_type: 'message',
    content: overrides.content ?? 'Alice paid invoice #42 on day 30 instead of usual day 15',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeDossierRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    entity_id: overrides.entity_id ?? 'entity-1',
    schema_json: overrides.schema_json ?? { typical_payment_day: 15 },
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('surprise-surfacer constants', () => {
  it('PROACTIVE_SURPRISE_THRESHOLD is 0.7', () => {
    expect(PROACTIVE_SURPRISE_THRESHOLD).toBe(0.7)
  })
})

describe('getSurpriseFacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns formatted insights for high-surprise facts (>0.7)', async () => {
    const walRow = makeWalRow({ id: 'wal-high', content: 'Alice paid on day 30 instead of day 15' })
    const dossierRow = makeDossierRow({ entity_id: 'entity-1', schema_json: { typical_payment_day: 15 } })

    mockedScoreSurprise.mockResolvedValueOnce({
      fact_id: 'wal-high',
      score: 0.85,
      deviation_type: 'contradicts_schema',
    } satisfies SurpriseScore)

    const sb = createMockSupabase({
      walRows: [walRow],
      dossierRows: [dossierRow],
    })

    const results = await getSurpriseFacts(sb as any, 'org-1', ['entity-1'])

    expect(results.length).toBe(1)
    expect(results[0].content).toBe('Alice paid on day 30 instead of day 15')
    expect(results[0].score).toBe(0.85)
    expect(results[0].deviationType).toBe('contradicts_schema')
  })

  it('filters out low-surprise facts (<=0.7)', async () => {
    const walRow = makeWalRow({ id: 'wal-low', content: 'Alice sent a normal payment' })
    const dossierRow = makeDossierRow()

    mockedScoreSurprise.mockResolvedValueOnce({
      fact_id: 'wal-low',
      score: 0.4,
      deviation_type: 'expected',
    } satisfies SurpriseScore)

    const sb = createMockSupabase({
      walRows: [walRow],
      dossierRows: [dossierRow],
    })

    const results = await getSurpriseFacts(sb as any, 'org-1', ['entity-1'])

    expect(results).toEqual([])
  })

  it('returns empty array when no WAL entries exist', async () => {
    const sb = createMockSupabase({ walRows: [] })

    const results = await getSurpriseFacts(sb as any, 'org-1', ['entity-1'])

    expect(results).toEqual([])
    expect(mockedScoreSurprise).not.toHaveBeenCalled()
  })

  it('returns empty array when entity list is empty', async () => {
    const sb = createMockSupabase()

    const results = await getSurpriseFacts(sb as any, 'org-1', [])

    expect(results).toEqual([])
  })

  it('marks surfaced facts to avoid repeating', async () => {
    const walRow = makeWalRow({ id: 'wal-mark' })
    const dossierRow = makeDossierRow()

    mockedScoreSurprise.mockResolvedValueOnce({
      fact_id: 'wal-mark',
      score: 0.9,
      deviation_type: 'magnitude_shift',
    } satisfies SurpriseScore)

    const sb = createMockSupabase({
      walRows: [walRow],
      dossierRows: [dossierRow],
    })

    await getSurpriseFacts(sb as any, 'org-1', ['entity-1'])

    // Should have called update on knowledge_log to mark surfaced
    expect(sb._updateFn).toHaveBeenCalled()
  })
})

describe('formatSurpriseForChannel', () => {
  const surpriseFact = {
    factId: 'f1',
    content: 'Alice paid on day 30 instead of usual day 15',
    score: 0.85,
    deviationType: 'contradicts_schema' as const,
  }

  it('formats SMS/sendblue as brief one-liner', () => {
    const result = formatSurpriseForChannel([surpriseFact], 'sendblue')

    expect(result).toContain('Heads up')
    expect(result).toContain('Alice paid on day 30')
    // Should be concise
    expect(result.length).toBeLessThan(300)
  })

  it('formats WhatsApp as brief one-liner', () => {
    const result = formatSurpriseForChannel([surpriseFact], 'whatsapp')

    expect(result).toContain('Heads up')
  })

  it('formats dashboard/web with richer detail', () => {
    const result = formatSurpriseForChannel([surpriseFact], 'web')

    expect(result).toContain('Unusual')
    // Dashboard format should include more context than SMS
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty string for empty facts', () => {
    expect(formatSurpriseForChannel([], 'web')).toBe('')
    expect(formatSurpriseForChannel([], 'sendblue')).toBe('')
  })

  it('SMS and dashboard formatting differ', () => {
    const sms = formatSurpriseForChannel([surpriseFact], 'sendblue')
    const dashboard = formatSurpriseForChannel([surpriseFact], 'web')

    expect(sms).not.toBe(dashboard)
  })
})

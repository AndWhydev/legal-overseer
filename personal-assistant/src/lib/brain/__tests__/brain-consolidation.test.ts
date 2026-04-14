/**
 * Brain Consolidation Pipeline — integration tests.
 *
 * Tests the full cron pipeline: WAL → facts → dossiers → profiles.
 * All external dependencies (Supabase, LLM, section-librarian, chief-librarian) mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry } from '../types'

// Mock dependencies
vi.mock('../wal-emitter', () => ({
  readWALTail: vi.fn(),
}))

vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((m: string) => m),
}))

vi.mock('../section-librarian', () => ({
  processDomainJobDirect: vi.fn(),
}))

vi.mock('../chief-librarian', () => ({
  synthesizeDomainProfile: vi.fn(),
}))

vi.mock('../predictive-coding', () => ({
  scoreSurprise: vi.fn(),
  shouldUpdateSchema: vi.fn(),
  updateSchemaFromErrors: vi.fn(),
  SURPRISE_THRESHOLD: 0.3,
}))

import { readWALTail } from '../wal-emitter'
import { generateText } from 'ai'
import { processDomainJobDirect } from '../section-librarian'
import { synthesizeDomainProfile } from '../chief-librarian'
import { runBrainConsolidation } from '../brain-consolidation'

const mockedReadWALTail = vi.mocked(readWALTail)
const mockedGenerateText = vi.mocked(generateText)
const mockedProcessDomain = vi.mocked(processDomainJobDirect)
const mockedSynthesize = vi.mocked(synthesizeDomainProfile)

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

function makeSupabase() {
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

describe('runBrainConsolidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env
    delete process.env.ENABLE_PREDICTIVE_CODING
  })

  it('returns zero counts when no WAL entries exist', async () => {
    mockedReadWALTail.mockResolvedValueOnce([])
    const supabase = makeSupabase()

    const report = await runBrainConsolidation(supabase as any, 'org-1')

    expect(report.walEntriesProcessed).toBe(0)
    expect(report.factsExtracted).toBe(0)
    expect(report.dossiersCompiled).toBe(0)
    expect(report.domainsUpdated).toBe(0)
  })

  it('runs full pipeline: read → extract → compile → synthesize → mark', async () => {
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

    mockedProcessDomain.mockResolvedValue(undefined)
    mockedSynthesize.mockResolvedValue({ updated: true })

    const supabase = makeSupabase()
    const report = await runBrainConsolidation(supabase as any, 'org-1')

    expect(report.walEntriesProcessed).toBe(2)
    expect(report.factsExtracted).toBe(2)
    expect(report.dossiersCompiled).toBe(2)
    expect(report.domainsUpdated).toBe(2)

    // Section librarian called for each entity
    expect(mockedProcessDomain).toHaveBeenCalledTimes(2)

    // Domain profiles synthesized for updated domains (financial + operational)
    expect(mockedSynthesize).toHaveBeenCalledTimes(2)

    // WAL entries marked consolidated
    expect(supabase._updateMock.in).toHaveBeenCalledWith('id', ['e1', 'e2'])
  })

  it('continues pipeline when a single dossier compilation fails', async () => {
    const entries = [
      makeEntry({ id: 'e1', content: 'Alice paid $500' }),
      makeEntry({ id: 'e2', content: 'Bob sent an email' }),
    ]
    mockedReadWALTail.mockResolvedValueOnce(entries)

    mockedGenerateText.mockResolvedValueOnce({
      text: [
        '{"entity_name": "Alice", "fact": "Paid $500", "domain": "financial"}',
        '{"entity_name": "Bob", "fact": "Sent email", "domain": "operational"}',
      ].join('\n'),
    } as any)

    // Alice fails, Bob succeeds
    mockedProcessDomain
      .mockRejectedValueOnce(new Error('Dossier compilation failed'))
      .mockResolvedValueOnce(undefined)

    mockedSynthesize.mockResolvedValue({ updated: true })

    const supabase = makeSupabase()
    const report = await runBrainConsolidation(supabase as any, 'org-1')

    expect(report.dossiersCompiled).toBe(1)
    expect(report.dossierErrors).toBe(1)
    // Pipeline still completes — entries still marked consolidated
    expect(supabase._updateMock.in).toHaveBeenCalledWith('id', ['e1', 'e2'])
  })

  it('only synthesizes domains that had dossier updates', async () => {
    const entries = [
      makeEntry({ id: 'e1', content: 'Alice paid $500' }),
    ]
    mockedReadWALTail.mockResolvedValueOnce(entries)

    mockedGenerateText.mockResolvedValueOnce({
      text: '{"entity_name": "Alice", "fact": "Paid $500", "domain": "financial"}\n',
    } as any)

    mockedProcessDomain.mockResolvedValue(undefined)
    mockedSynthesize.mockResolvedValue({ updated: true })

    const supabase = makeSupabase()
    await runBrainConsolidation(supabase as any, 'org-1')

    // Only financial domain should be synthesized (not relational/operational/behavioral)
    expect(mockedSynthesize).toHaveBeenCalledTimes(1)
    expect(mockedSynthesize).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'financial',
    )
  })

  it('reports accurate timestamps', async () => {
    mockedReadWALTail.mockResolvedValueOnce([])
    const supabase = makeSupabase()

    const report = await runBrainConsolidation(supabase as any, 'org-1')

    expect(report.startedAt).toBeTruthy()
    expect(report.completedAt).toBeTruthy()
    expect(new Date(report.completedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(report.startedAt).getTime(),
    )
  })
})

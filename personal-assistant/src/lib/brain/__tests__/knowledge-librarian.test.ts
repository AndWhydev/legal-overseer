/**
 * Knowledge Librarian worker — tests.
 *
 * Mocks:
 *   - `buildConnectionDossier` (dossier builder)
 *   - `emitToWAL` (WAL write)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/composio/dossier', () => ({
  buildConnectionDossier: vi.fn(),
}))

vi.mock('../wal-emitter', () => ({
  emitToWAL: vi.fn(),
}))

import { buildConnectionDossier, type ConnectionDossier } from '@/lib/composio/dossier'
import { emitToWAL } from '../wal-emitter'
import {
  processConnectionConnected,
  renderDossierContent,
} from '../workers/knowledge-librarian'
import type { ConnectionCrawlJob } from '../worker-infra'

const mockedBuild = vi.mocked(buildConnectionDossier)
const mockedEmit = vi.mocked(emitToWAL)

function makeDossier(overrides: Partial<ConnectionDossier> = {}): ConnectionDossier {
  return {
    appKey: 'gmail',
    connectedAccountId: 'ca-123',
    connectedAt: '2026-04-13T00:00:00.000Z',
    capabilities: ['GMAIL_SEND_EMAIL', 'GMAIL_LIST_THREADS'],
    tools: [
      {
        name: 'GMAIL_SEND_EMAIL',
        description: 'Send an email via Gmail',
        inputKeys: ['to', 'subject', 'body'],
      },
      {
        name: 'GMAIL_LIST_THREADS',
        description: 'List Gmail threads',
        inputKeys: ['max_results', 'query'],
      },
    ],
    suggestedUseCases: 'Draft and send Gmail messages; scan recent threads.',
    ...overrides,
  }
}

function makeJob(overrides: Partial<ConnectionCrawlJob> = {}) {
  return {
    id: 'job-1',
    data: {
      orgId: 'org-1',
      appKey: 'gmail',
      connectedAccountId: 'ca-123',
      ...overrides,
    },
  }
}

describe('renderDossierContent', () => {
  it('includes appKey, connectedAccountId, tool lines, and use cases', () => {
    const text = renderDossierContent(makeDossier())
    expect(text).toContain('gmail')
    expect(text).toContain('ca-123')
    expect(text).toContain('GMAIL_SEND_EMAIL')
    expect(text).toContain('GMAIL_LIST_THREADS')
    expect(text).toContain('Draft and send Gmail messages')
  })

  it('handles an empty tool list gracefully', () => {
    const text = renderDossierContent(
      makeDossier({ tools: [], capabilities: [] }),
    )
    expect(text).toContain('no tools discovered')
  })
})

describe('processConnectionConnected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a dossier and emits a pattern-signal WAL entry containing the dossier text', async () => {
    const dossier = makeDossier()
    mockedBuild.mockResolvedValueOnce(dossier)
    mockedEmit.mockResolvedValueOnce({
      id: 'wal-xyz',
      org_id: 'org-1',
      entity_ids: ['capability:gmail:ca-123'],
      signal_type: 'pattern',
      content: 'ignored',
      confidence: 0.95,
      source_memory_id: null,
      source_thread_id: null,
      consolidated_at: null,
      created_at: '2026-04-13T00:00:00Z',
    })

    const supabase = {} as any
    const result = await processConnectionConnected(supabase, makeJob())

    expect(mockedBuild).toHaveBeenCalledWith({
      orgId: 'org-1',
      appKey: 'gmail',
      connectedAccountId: 'ca-123',
    })

    expect(mockedEmit).toHaveBeenCalledTimes(1)
    const emitCall = mockedEmit.mock.calls[0]
    expect(emitCall[0]).toBe(supabase)
    const params = emitCall[1]
    expect(params.org_id).toBe('org-1')
    expect(params.signal_type).toBe('pattern')
    expect(params.entity_ids).toEqual(['capability:gmail:ca-123'])
    expect(params.confidence).toBeGreaterThan(0.5)
    expect(params.content).toContain('GMAIL_SEND_EMAIL')
    expect(params.content).toContain('Draft and send Gmail messages')

    expect(result.dossier).toEqual(dossier)
    expect(result.walEntryId).toBe('wal-xyz')
  })

  it('returns walEntryId=null when WAL emission fails but still returns the dossier', async () => {
    const dossier = makeDossier()
    mockedBuild.mockResolvedValueOnce(dossier)
    mockedEmit.mockResolvedValueOnce(null)

    const result = await processConnectionConnected({} as any, makeJob())

    expect(result.dossier).toEqual(dossier)
    expect(result.walEntryId).toBeNull()
  })

  it('persists the dossier narrative onto the matching org_connections row', async () => {
    const dossier = makeDossier()
    mockedBuild.mockResolvedValueOnce(dossier)
    mockedEmit.mockResolvedValueOnce({
      id: 'wal-xyz',
      org_id: 'org-1',
      entity_ids: ['capability:gmail:ca-123'],
      signal_type: 'pattern',
      content: '',
      confidence: 0.95,
      source_memory_id: null,
      source_thread_id: null,
      consolidated_at: null,
      created_at: '2026-04-13T00:00:00Z',
    })

    // Mock supabase client that captures SELECT + UPDATE against org_connections.
    const updateCalls: Array<Record<string, unknown>> = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'org_connections') throw new Error(`unexpected table: ${table}`)
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'row-1', config: { existing: true } },
                  error: null,
                }),
              })),
            })),
          })),
          update: vi.fn((u: Record<string, unknown>) => {
            updateCalls.push(u)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }),
    } as any

    await processConnectionConnected(supabase, makeJob())

    expect(updateCalls).toHaveLength(1)
    const updated = updateCalls[0].config as Record<string, unknown>
    expect(updated.existing).toBe(true) // preserves existing config
    expect(updated.dossier_narrative).toBe('Draft and send Gmail messages; scan recent threads.')
    expect(updated.dossier_capabilities).toEqual(['GMAIL_SEND_EMAIL', 'GMAIL_LIST_THREADS'])
    expect(typeof updated.dossier_synced_at).toBe('string')
  })

  it('passes through the connectedAccountId from the job payload to the dossier builder', async () => {
    mockedBuild.mockResolvedValueOnce(
      makeDossier({ connectedAccountId: 'ca-zzz', appKey: 'notion' }),
    )
    mockedEmit.mockResolvedValueOnce({
      id: 'wal-1',
      org_id: 'org-1',
      entity_ids: [],
      signal_type: 'pattern',
      content: '',
      confidence: 0.95,
      source_memory_id: null,
      source_thread_id: null,
      consolidated_at: null,
      created_at: '2026-04-13T00:00:00Z',
    })

    await processConnectionConnected(
      {} as any,
      makeJob({ appKey: 'notion', connectedAccountId: 'ca-zzz' }),
    )

    expect(mockedBuild).toHaveBeenCalledWith({
      orgId: 'org-1',
      appKey: 'notion',
      connectedAccountId: 'ca-zzz',
    })

    const emittedEntityIds = mockedEmit.mock.calls[0][1].entity_ids
    expect(emittedEntityIds).toEqual(['capability:notion:ca-zzz'])
  })
})

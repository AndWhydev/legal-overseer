/**
 * Dossier Compiler — TDD tests.
 *
 * Tests estimateTokenCount, new dossier creation, and delta-merge compilation.
 * LLM-dependent functions are tested with mocked generateText calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { KnowledgeLogEntry, EntityDossier, DossierDelta } from '../types'

// Mock the AI SDK before importing the module under test
vi.mock('ai', () => ({
  generateText: vi.fn(),
  gateway: vi.fn((modelId: string) => modelId),
}))

import { generateText } from 'ai'
import {
  estimateTokenCount,
  compileDossierDelta,
  MAX_DOSSIER_TOKENS,
  CHARS_PER_TOKEN,
} from '../dossier-compiler'

const mockedGenerateText = vi.mocked(generateText)

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFact(overrides: Partial<KnowledgeLogEntry> = {}): KnowledgeLogEntry {
  return {
    id: overrides.id ?? 'fact-1',
    org_id: 'org-1',
    entity_ids: ['entity-1'],
    signal_type: 'message',
    content: 'Alice sent a payment of $500',
    confidence: 0.9,
    source_memory_id: null,
    source_thread_id: null,
    consolidated_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeDossier(overrides: Partial<EntityDossier> = {}): EntityDossier {
  return {
    id: 'dossier-1',
    org_id: 'org-1',
    entity_id: 'entity-1',
    entity_name: 'Alice',
    dossier_markdown: '## Summary\nAlice is a regular client.\n\n## Key Facts\n- Pays invoices on time\n',
    schema_json: {},
    version: 1,
    last_compiled_at: new Date().toISOString(),
    stale_since: null,
    token_count: 50,
    facts_incorporated: 3,
    last_fact_id: 'fact-0',
    compilation_model: 'anthropic/claude-sonnet-4.6',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeDelta(overrides: Partial<DossierDelta> = {}): DossierDelta {
  return {
    entity_id: 'entity-1',
    new_facts: [makeFact()],
    current_dossier: null,
    ...overrides,
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

describe('dossier-compiler constants', () => {
  it('MAX_DOSSIER_TOKENS is 1500', () => {
    expect(MAX_DOSSIER_TOKENS).toBe(1500)
  })

  it('CHARS_PER_TOKEN is 3.5', () => {
    expect(CHARS_PER_TOKEN).toBe(3.5)
  })
})

// ─── estimateTokenCount ─────────────────────────────────────────────────────

describe('estimateTokenCount', () => {
  it('returns 100 for a 350-character string', () => {
    const text = 'a'.repeat(350)
    expect(estimateTokenCount(text)).toBe(100)
  })

  it('rounds up partial token counts', () => {
    // 10 chars / 3.5 = 2.857... → ceil = 3
    expect(estimateTokenCount('abcdefghij')).toBe(3)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0)
  })

  it('returns 0 for null input', () => {
    expect(estimateTokenCount(null as unknown as string)).toBe(0)
  })

  it('returns 0 for undefined input', () => {
    expect(estimateTokenCount(undefined as unknown as string)).toBe(0)
  })

  it('returns 1 for a single character', () => {
    // 1 / 3.5 = 0.2857 → ceil = 1
    expect(estimateTokenCount('a')).toBe(1)
  })
})

// ─── compileDossierDelta ────────────────────────────────────────────────────

describe('compileDossierDelta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('new dossier path (current_dossier is null)', () => {
    it('calls LLM to create dossier from scratch when current_dossier is null', async () => {
      const generatedMarkdown = '## Summary\nAlice is a new contact.\n\n## Key Facts\n- Sent a payment of $500\n\n## Recent Activity\n- Payment received\n\n## Patterns\n- None yet'

      mockedGenerateText.mockResolvedValueOnce({
        text: generatedMarkdown,
      } as any)

      const delta = makeDelta({ current_dossier: null })
      const result = await compileDossierDelta(delta)

      expect(result.markdown).toBe(generatedMarkdown)
      expect(result.token_count).toBe(estimateTokenCount(generatedMarkdown))
      expect(result.model).toBe('anthropic/claude-sonnet-4.6')
      expect(mockedGenerateText).toHaveBeenCalledTimes(1)
    })

    it('calls LLM to create dossier from scratch when dossier_markdown is empty', async () => {
      const generatedMarkdown = '## Summary\nAlice is a new contact.'

      mockedGenerateText.mockResolvedValueOnce({
        text: generatedMarkdown,
      } as any)

      const delta = makeDelta({
        current_dossier: makeDossier({ dossier_markdown: '' }),
      })
      const result = await compileDossierDelta(delta)

      expect(result.markdown).toBe(generatedMarkdown)
      expect(mockedGenerateText).toHaveBeenCalledTimes(1)
    })

    it('uses the balanced model (Sonnet)', async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: '## Summary\nNew dossier',
      } as any)

      const delta = makeDelta({ current_dossier: null })
      await compileDossierDelta(delta)

      const callArgs = mockedGenerateText.mock.calls[0][0] as any
      // gateway(models.balanced) returns models.balanced since gateway is mocked as passthrough
      expect(callArgs.model).toBe('anthropic/claude-sonnet-4.6')
    })

    it('includes system prompt requesting structured sections', async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: '## Summary\nTest',
      } as any)

      const delta = makeDelta({ current_dossier: null })
      await compileDossierDelta(delta)

      const callArgs = mockedGenerateText.mock.calls[0][0] as any
      expect(callArgs.system).toContain('## Summary')
      expect(callArgs.system).toContain('## Key Facts')
      expect(callArgs.system).toContain('## Recent Activity')
      expect(callArgs.system).toContain('## Patterns')
    })
  })

  describe('delta merge path (current_dossier exists)', () => {
    it('sends current dossier + new facts to LLM for merge', async () => {
      const updatedMarkdown = '## Summary\nAlice is a regular client who recently sent a large payment.\n\n## Key Facts\n- Pays invoices on time\n- Sent $500 payment\n\n## Recent Activity\n- $500 payment received\n\n## Patterns\n- Regular payer'

      mockedGenerateText.mockResolvedValueOnce({
        text: updatedMarkdown,
      } as any)

      const currentDossier = makeDossier()
      const delta = makeDelta({
        current_dossier: currentDossier,
        new_facts: [
          makeFact({ id: 'fact-new', content: 'Alice sent $500 payment' }),
        ],
      })

      const result = await compileDossierDelta(delta)

      expect(result.markdown).toBe(updatedMarkdown)
      expect(result.token_count).toBe(estimateTokenCount(updatedMarkdown))
      expect(result.model).toBe('anthropic/claude-sonnet-4.6')
      expect(mockedGenerateText).toHaveBeenCalledTimes(1)
    })

    it('includes current dossier content and new facts in prompt', async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: '## Summary\nUpdated',
      } as any)

      const currentDossier = makeDossier({
        dossier_markdown: '## Summary\nExisting dossier content',
      })
      const delta = makeDelta({
        current_dossier: currentDossier,
        new_facts: [
          makeFact({ content: 'Alice changed phone number to 555-1234' }),
        ],
      })

      await compileDossierDelta(delta)

      const callArgs = mockedGenerateText.mock.calls[0][0] as any
      expect(callArgs.prompt).toContain('Existing dossier content')
      expect(callArgs.prompt).toContain('Alice changed phone number to 555-1234')
    })

    it('includes merge instructions in system prompt', async () => {
      mockedGenerateText.mockResolvedValueOnce({
        text: '## Summary\nMerged',
      } as any)

      const delta = makeDelta({
        current_dossier: makeDossier(),
      })

      await compileDossierDelta(delta)

      const callArgs = mockedGenerateText.mock.calls[0][0] as any
      expect(callArgs.system).toContain('updated dossier')
      expect(callArgs.system).toContain('Merge new facts')
    })
  })

  describe('error handling', () => {
    it('throws on LLM failure', async () => {
      mockedGenerateText.mockRejectedValueOnce(new Error('API timeout'))

      const delta = makeDelta({ current_dossier: null })

      await expect(compileDossierDelta(delta)).rejects.toThrow('API timeout')
    })
  })
})

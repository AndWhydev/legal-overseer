/**
 * Query Gate Integration — verifies that System 1/2 classification
 * correctly controls ContextAssembler configuration in the TAOR loop.
 *
 * System 1 (fast path): cache-only, no global workspace, reduced entities
 * System 2 (full path): prompt cache + global workspace + full retrieval
 */

import { describe, it, expect } from 'vitest'

import {
  classifyQueryComplexity,
  type QueryComplexity,
} from '../query-gate'

// ─── Classification routing tests ─────────────────────────────────────────

describe('Query Gate Integration — classification routing', () => {
  // ── System 1: simple messages skip full retrieval ──────────────────────

  it('classifies "hey" as system1', () => {
    expect(classifyQueryComplexity('hey')).toBe('system1')
  })

  it('classifies "thanks" as system1', () => {
    expect(classifyQueryComplexity('thanks')).toBe('system1')
  })

  it('classifies "ok" as system1', () => {
    expect(classifyQueryComplexity('ok')).toBe('system1')
  })

  it('classifies short action queries as system1', () => {
    expect(classifyQueryComplexity('send it')).toBe('system1')
  })

  // ── System 2: complex messages get full retrieval ─────────────────────

  it('classifies invoice status query as system2', () => {
    expect(
      classifyQueryComplexity(
        "what's the status of the invoice for Steve from last month",
      ),
    ).toBe('system2')
  })

  it('classifies multi-entity queries as system2', () => {
    expect(
      classifyQueryComplexity('compare Steve and Jane', { entityMentionCount: 3 }),
    ).toBe('system2')
  })

  it('classifies reasoning queries as system2', () => {
    expect(
      classifyQueryComplexity('why did the payment fail for the Acme project?'),
    ).toBe('system2')
  })

  it('classifies temporal queries as system2', () => {
    expect(
      classifyQueryComplexity('what happened last week with the invoices?'),
    ).toBe('system2')
  })
})

// ─── Assembler config derivation tests ────────────────────────────────────

describe('Query Gate Integration — assembler config derivation', () => {
  /**
   * Mirrors the assemblerOverrides logic in taor-loop.ts to verify
   * that System 1/2 classification maps to correct assembler config.
   */
  function deriveAssemblerOverrides(complexity: QueryComplexity) {
    if (complexity === 'system1') {
      return {
        usePromptCache: true,
        useGlobalWorkspace: false,
        maxEntities: 3,
        includeCompressedHistory: false,
      }
    }
    return {
      usePromptCache: true,
      useGlobalWorkspace: true,
    }
  }

  it('system1 config excludes global workspace', () => {
    const complexity = classifyQueryComplexity('hey')
    const config = deriveAssemblerOverrides(complexity)

    expect(config.useGlobalWorkspace).toBe(false)
    expect(config.usePromptCache).toBe(true)
  })

  it('system1 config limits entities and skips compressed history', () => {
    const complexity = classifyQueryComplexity('ok')
    const config = deriveAssemblerOverrides(complexity)

    expect(config).toEqual({
      usePromptCache: true,
      useGlobalWorkspace: false,
      maxEntities: 3,
      includeCompressedHistory: false,
    })
  })

  it('system2 config enables global workspace', () => {
    const complexity = classifyQueryComplexity(
      "what's the status of the invoice for Steve from last month",
    )
    const config = deriveAssemblerOverrides(complexity)

    expect(config.useGlobalWorkspace).toBe(true)
    expect(config.usePromptCache).toBe(true)
  })

  it('system2 config does not restrict entities or history', () => {
    const complexity = classifyQueryComplexity('analyze all client revenue')
    const config = deriveAssemblerOverrides(complexity)

    // System 2 config should NOT have maxEntities or includeCompressedHistory overrides
    expect(config).toEqual({
      usePromptCache: true,
      useGlobalWorkspace: true,
    })
    expect(config).not.toHaveProperty('maxEntities')
    expect(config).not.toHaveProperty('includeCompressedHistory')
  })

  it('multi-entity queries always get system2 full retrieval', () => {
    // Even a greeting with high entity count gets system2
    const complexity = classifyQueryComplexity('hey', { entityMentionCount: 3 })
    const config = deriveAssemblerOverrides(complexity)

    expect(complexity).toBe('system2')
    expect(config.useGlobalWorkspace).toBe(true)
  })
})

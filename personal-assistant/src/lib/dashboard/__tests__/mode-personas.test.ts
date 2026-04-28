/**
 * mode-personas.test.ts — TDD RED phase
 *
 * Tests for mode-personas.ts, which provides per-mode agent persona config.
 * Tests run before the implementation exists — they should fail until
 * mode-personas.ts is created.
 *
 * Cases:
 *   (a) Each mode's persona produces a distinct systemPromptFragment
 *   (b) Context-builder with mode=inbox includes inbox fragment, excludes money fragment
 *   (c) Retrieval-bias weights propagate to the RAG call (mock)
 *   (d) DEFAULT_PERSONA used when mode is undefined
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERSONAS, DEFAULT_PERSONA, applyModePersona, getRetrievalBias, getModePurpose, type ModePersona } from '../mode-personas'
import type { Mode } from '../mode-store'

describe('mode-personas — PERSONAS object', () => {
  it('(a) each mode has a distinct systemPromptFragment', () => {
    const fragments = new Set<string>()
    const modes: Mode[] = ['chat', 'inbox', 'work', 'money']
    for (const m of modes) {
      const frag = PERSONAS[m].systemPromptFragment
      expect(frag, `Mode "${m}" must have a non-empty systemPromptFragment`).toBeTruthy()
      expect(frag.length, `Mode "${m}" fragment must be > 20 chars`).toBeGreaterThan(20)
      fragments.add(frag)
    }
    // All 4 fragments are distinct
    expect(fragments.size).toBe(4)
  })

  it('(a) each mode has all required persona fields', () => {
    const modes: Mode[] = ['chat', 'inbox', 'work', 'money']
    for (const m of modes) {
      const p = PERSONAS[m]
      expect(p.systemPromptFragment, `${m}.systemPromptFragment`).toBeTruthy()
      expect(p.toneDirectives, `${m}.toneDirectives`).toBeTruthy()
      expect(Array.isArray(p.retrievalBias.namespaces), `${m}.retrievalBias.namespaces`).toBe(true)
      expect(p.retrievalBias.namespaces.length, `${m} must have ≥1 namespace`).toBeGreaterThanOrEqual(1)
      expect(typeof p.retrievalBias.weight, `${m}.retrievalBias.weight`).toBe('number')
      expect(p.retrievalBias.weight, `${m}.weight must be 0–1`).toBeGreaterThan(0)
      expect(p.retrievalBias.weight, `${m}.weight must be ≤1`).toBeLessThanOrEqual(1)
      expect(Array.isArray(p.suggestedTools), `${m}.suggestedTools`).toBe(true)
    }
  })

  it('(a) inbox persona references message/thread/triage concepts', () => {
    const inboxFrag = PERSONAS['inbox'].systemPromptFragment.toLowerCase()
    const hasRelevantContent = inboxFrag.includes('inbox') || inboxFrag.includes('message') || inboxFrag.includes('triage')
    expect(hasRelevantContent).toBe(true)
  })

  it('(a) money persona references financial/numeric concepts', () => {
    const moneyFrag = PERSONAS['money'].systemPromptFragment.toLowerCase()
    const hasRelevantContent = moneyFrag.includes('invoice') || moneyFrag.includes('payment') || moneyFrag.includes('financial') || moneyFrag.includes('revenue') || moneyFrag.includes('money')
    expect(hasRelevantContent).toBe(true)
  })
})

describe('mode-personas — applyModePersona (context-builder integration)', () => {
  it('(b) mode=inbox appends inbox persona fragment to base prompt', () => {
    const basePrompt = 'You are BitBit.'
    const result = applyModePersona(basePrompt, 'inbox')
    expect(result).toContain(basePrompt)
    expect(result).toContain(PERSONAS['inbox'].systemPromptFragment)
    expect(result).toContain(PERSONAS['inbox'].toneDirectives)
  })

  it('(b) mode=inbox does NOT include money fragment in output', () => {
    const basePrompt = 'You are BitBit.'
    const result = applyModePersona(basePrompt, 'inbox')
    // Money fragment should not appear when in inbox mode
    expect(result).not.toContain(PERSONAS['money'].systemPromptFragment)
  })

  it('(b) mode=work appends work fragment and excludes inbox fragment', () => {
    const basePrompt = 'You are BitBit.'
    const result = applyModePersona(basePrompt, 'work')
    expect(result).toContain(PERSONAS['work'].systemPromptFragment)
    expect(result).not.toContain(PERSONAS['inbox'].systemPromptFragment)
  })
})

describe('mode-personas — retrieval bias', () => {
  it('(c) retrieval bias namespaces for inbox include message-related terms', () => {
    const bias = PERSONAS['inbox'].retrievalBias
    const namespacesStr = bias.namespaces.join(' ')
    const hasMessageNamespace = namespacesStr.includes('message') || namespacesStr.includes('thread') || namespacesStr.includes('approval') || namespacesStr.includes('inbox')
    expect(hasMessageNamespace).toBe(true)
  })

  it('(c) retrieval bias namespaces for money include finance-related terms', () => {
    const bias = PERSONAS['money'].retrievalBias
    const namespacesStr = bias.namespaces.join(' ')
    const hasFinanceNamespace = namespacesStr.includes('invoice') || namespacesStr.includes('payment') || namespacesStr.includes('cost') || namespacesStr.includes('revenue')
    expect(hasFinanceNamespace).toBe(true)
  })

  it('(c) retrieval bias weight is between 0 and 1 for all modes', () => {
    const modes: Mode[] = ['chat', 'inbox', 'work', 'money']
    for (const m of modes) {
      const w = PERSONAS[m].retrievalBias.weight
      expect(w).toBeGreaterThan(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })

  it('(c) getRetrievalBias returns mode persona bias, not undefined', () => {
    const inboxBias = getRetrievalBias('inbox')
    expect(inboxBias).toBeTruthy()
    expect(inboxBias.namespaces).toBeTruthy()
    expect(inboxBias.weight).toBeGreaterThan(0)
  })
})

describe('mode-personas — DEFAULT_PERSONA fallback', () => {
  it('(d) DEFAULT_PERSONA exists and has all required fields', () => {
    expect(DEFAULT_PERSONA).toBeTruthy()
    expect(DEFAULT_PERSONA.systemPromptFragment).toBeDefined()
    expect(DEFAULT_PERSONA.toneDirectives).toBeDefined()
    expect(DEFAULT_PERSONA.retrievalBias).toBeDefined()
    expect(Array.isArray(DEFAULT_PERSONA.suggestedTools)).toBe(true)
  })

  it('(d) applyModePersona with undefined mode uses DEFAULT_PERSONA', () => {
    const basePrompt = 'You are BitBit.'
    const result = applyModePersona(basePrompt, undefined)
    // When mode is undefined, should return basePrompt unchanged OR with default fragment
    // Either way it should not contain any mode-specific fragment
    expect(result).toContain(basePrompt)
    expect(result).not.toContain(PERSONAS['inbox'].systemPromptFragment)
    expect(result).not.toContain(PERSONAS['work'].systemPromptFragment)
    expect(result).not.toContain(PERSONAS['money'].systemPromptFragment)
  })

  it('(d) applyModePersona with invalid mode uses DEFAULT_PERSONA', () => {
    const basePrompt = 'You are BitBit.'
    const result = applyModePersona(basePrompt, 'invalid-mode')
    expect(result).toContain(basePrompt)
    // Should not crash, should return safe fallback
  })
})

describe('mode-personas — modelPurpose (per-mode model routing)', () => {
  it('inbox prefers classification (cheap/fast triage)', () => {
    expect(PERSONAS['inbox'].modelPurpose).toBe('classification')
    expect(getModePurpose('inbox')).toBe('classification')
  })

  it('money prefers synthesis (high-stakes numeric reasoning)', () => {
    expect(PERSONAS['money'].modelPurpose).toBe('synthesis')
    expect(getModePurpose('money')).toBe('synthesis')
  })

  it('work prefers conversation (balanced planning)', () => {
    expect(PERSONAS['work'].modelPurpose).toBe('conversation')
    expect(getModePurpose('work')).toBe('conversation')
  })

  it('chat prefers conversation (default balanced)', () => {
    expect(PERSONAS['chat'].modelPurpose).toBe('conversation')
    expect(getModePurpose('chat')).toBe('conversation')
  })

  it('every mode declares a modelPurpose', () => {
    const modes: Mode[] = ['chat', 'inbox', 'work', 'money']
    const validPurposes = ['classification', 'conversation', 'synthesis']
    for (const m of modes) {
      expect(validPurposes).toContain(PERSONAS[m].modelPurpose)
    }
  })

  it('getModePurpose falls back to DEFAULT_PERSONA purpose for undefined/invalid mode', () => {
    expect(getModePurpose(undefined)).toBe(DEFAULT_PERSONA.modelPurpose)
    expect(getModePurpose(null)).toBe(DEFAULT_PERSONA.modelPurpose)
    expect(getModePurpose('not-a-mode')).toBe(DEFAULT_PERSONA.modelPurpose)
  })

  it('DEFAULT_PERSONA modelPurpose is a no-op safe choice (conversation)', () => {
    expect(DEFAULT_PERSONA.modelPurpose).toBe('conversation')
  })
})

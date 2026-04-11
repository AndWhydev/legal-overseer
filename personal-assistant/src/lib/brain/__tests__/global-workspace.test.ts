/**
 * Global Workspace — TDD tests.
 *
 * Tests competitive context selection where memory modules compete for
 * token budget based on query relevance. Fiduciary module always included.
 * Tests written FIRST per TDD discipline.
 */

import { describe, it, expect } from 'vitest'

import {
  allocateContextBudget,
  MEMORY_MODULES,
  PRIORITY_WEIGHTS,
  detectModuleContext,
  type MemoryModule,
  type ModuleContext,
  type ModuleAllocation,
} from '../global-workspace'

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<ModuleContext> = {}): ModuleContext {
  return {
    entityMentions: [],
    queryComplexity: 'system1',
    hasFinancialSignals: false,
    hasDecisionSignals: false,
    hasTemporalSignals: false,
    ...overrides,
  }
}

function findModule(allocations: ModuleAllocation[], name: string): ModuleAllocation | undefined {
  return allocations.find((a) => a.moduleName === name)
}

// ─── PRIORITY_WEIGHTS ─────────────────────────────────────────────────────

describe('PRIORITY_WEIGHTS', () => {
  it('maps critical=10, high=5, medium=3, low=1', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      critical: 10,
      high: 5,
      medium: 3,
      low: 1,
    })
  })
})

// ─── MEMORY_MODULES ───────────────────────────────────────────────────────

describe('MEMORY_MODULES', () => {
  it('defines exactly 7 modules', () => {
    expect(MEMORY_MODULES).toHaveLength(7)
  })

  it('includes fiduciary as critical priority', () => {
    const fiduciary = MEMORY_MODULES.find((m) => m.name === 'fiduciary')
    expect(fiduciary).toBeDefined()
    expect(fiduciary!.priority).toBe('critical')
    expect(fiduciary!.minTokens).toBe(200)
    expect(fiduciary!.maxTokens).toBe(500)
  })

  it('includes entity_dossier as high priority', () => {
    const mod = MEMORY_MODULES.find((m) => m.name === 'entity_dossier')
    expect(mod).toBeDefined()
    expect(mod!.priority).toBe('high')
    expect(mod!.minTokens).toBe(500)
    expect(mod!.maxTokens).toBe(4000)
  })
})

// ─── detectModuleContext ──────────────────────────────────────────────────

describe('detectModuleContext', () => {
  it('detects financial signals from "invoice" keyword', () => {
    const ctx = detectModuleContext('Send me the invoice for last month')
    expect(ctx.hasFinancialSignals).toBe(true)
  })

  it('detects financial signals from "payment" keyword', () => {
    const ctx = detectModuleContext('When is the payment due?')
    expect(ctx.hasFinancialSignals).toBe(true)
  })

  it('detects decision signals from "should I" keyword', () => {
    const ctx = detectModuleContext('Should I accept this offer?')
    expect(ctx.hasDecisionSignals).toBe(true)
  })

  it('detects decision signals from "decide" keyword', () => {
    const ctx = detectModuleContext('I need to decide on the vendor')
    expect(ctx.hasDecisionSignals).toBe(true)
  })

  it('detects temporal signals from "deadline" keyword', () => {
    const ctx = detectModuleContext('What is the deadline for the report?')
    expect(ctx.hasTemporalSignals).toBe(true)
  })

  it('detects temporal signals from "schedule" keyword', () => {
    const ctx = detectModuleContext('Schedule a meeting for tomorrow')
    expect(ctx.hasTemporalSignals).toBe(true)
  })

  it('returns false for all signals with neutral query', () => {
    const ctx = detectModuleContext('Hello there')
    expect(ctx.hasFinancialSignals).toBe(false)
    expect(ctx.hasDecisionSignals).toBe(false)
    expect(ctx.hasTemporalSignals).toBe(false)
  })
})

// ─── Module scoreRelevance ────────────────────────────────────────────────

describe('Module scoreRelevance', () => {
  const fiduciary = MEMORY_MODULES.find((m) => m.name === 'fiduciary')!
  const entityDossier = MEMORY_MODULES.find((m) => m.name === 'entity_dossier')!
  const decisionMemory = MEMORY_MODULES.find((m) => m.name === 'decision_memory')!
  const financialMemory = MEMORY_MODULES.find((m) => m.name === 'financial_memory')!
  const temporalMemory = MEMORY_MODULES.find((m) => m.name === 'temporal_memory')!
  const patternMemory = MEMORY_MODULES.find((m) => m.name === 'pattern_memory')!
  const warningMemory = MEMORY_MODULES.find((m) => m.name === 'warning_memory')!

  it('fiduciary always returns 1.0', () => {
    expect(fiduciary.scoreRelevance('anything', makeContext())).toBe(1.0)
    expect(fiduciary.scoreRelevance('hello', makeContext({ hasFinancialSignals: true }))).toBe(1.0)
  })

  it('entity_dossier scores higher with more entity mentions', () => {
    const noEntities = entityDossier.scoreRelevance('hello', makeContext())
    const oneEntity = entityDossier.scoreRelevance('hello', makeContext({ entityMentions: ['Alice'] }))
    const threeEntities = entityDossier.scoreRelevance('hello', makeContext({ entityMentions: ['Alice', 'Bob', 'Carol'] }))
    expect(oneEntity).toBeGreaterThan(noEntities)
    expect(threeEntities).toBeGreaterThan(oneEntity)
  })

  it('entity_dossier returns 0 with no entity mentions', () => {
    expect(entityDossier.scoreRelevance('hello', makeContext())).toBe(0)
  })

  it('decision_memory returns 0.8 when decision signals present', () => {
    expect(decisionMemory.scoreRelevance('test', makeContext({ hasDecisionSignals: true }))).toBe(0.8)
  })

  it('decision_memory returns low score without decision signals', () => {
    expect(decisionMemory.scoreRelevance('test', makeContext())).toBeLessThan(0.1)
  })

  it('financial_memory returns 0.8 when financial signals present', () => {
    expect(financialMemory.scoreRelevance('test', makeContext({ hasFinancialSignals: true }))).toBe(0.8)
  })

  it('financial_memory returns low score without financial signals', () => {
    expect(financialMemory.scoreRelevance('test', makeContext())).toBeLessThan(0.1)
  })

  it('temporal_memory returns 0.7 with temporal signals', () => {
    expect(temporalMemory.scoreRelevance('test', makeContext({ hasTemporalSignals: true }))).toBe(0.7)
  })

  it('temporal_memory returns 0.3 baseline without temporal signals', () => {
    expect(temporalMemory.scoreRelevance('test', makeContext())).toBe(0.3)
  })

  it('pattern_memory returns 0.4 with entity mentions', () => {
    expect(patternMemory.scoreRelevance('test', makeContext({ entityMentions: ['Alice'] }))).toBe(0.4)
  })

  it('pattern_memory returns 0.1 without entity mentions', () => {
    expect(patternMemory.scoreRelevance('test', makeContext())).toBe(0.1)
  })

  it('warning_memory returns 0.2 baseline', () => {
    expect(warningMemory.scoreRelevance('test', makeContext())).toBe(0.2)
  })
})

// ─── allocateContextBudget ────────────────────────────────────────────────

describe('allocateContextBudget', () => {
  it('fiduciary is always in allocations', () => {
    const result = allocateContextBudget('hello', 5000, makeContext())
    const fiduciary = findModule(result, 'fiduciary')
    expect(fiduciary).toBeDefined()
    expect(fiduciary!.tokenBudget).toBeGreaterThanOrEqual(200)
  })

  it('fiduciary stays in allocations even with minimal budget', () => {
    const result = allocateContextBudget('hello', 200, makeContext())
    const fiduciary = findModule(result, 'fiduciary')
    expect(fiduciary).toBeDefined()
    expect(fiduciary!.tokenBudget).toBe(200)
  })

  it('entity_dossier gets higher budget with more entity mentions', () => {
    const fewEntities = allocateContextBudget('hello', 10000, makeContext({ entityMentions: ['Alice'] }))
    const manyEntities = allocateContextBudget('hello', 10000, makeContext({ entityMentions: ['Alice', 'Bob', 'Carol'] }))

    const fewBudget = findModule(fewEntities, 'entity_dossier')?.tokenBudget ?? 0
    const manyBudget = findModule(manyEntities, 'entity_dossier')?.tokenBudget ?? 0
    expect(manyBudget).toBeGreaterThanOrEqual(fewBudget)
  })

  it('financial_memory ranks high when "invoice" is in query', () => {
    const ctx = makeContext({ hasFinancialSignals: true })
    const result = allocateContextBudget('Send me the invoice total', 10000, ctx)
    const financial = findModule(result, 'financial_memory')
    expect(financial).toBeDefined()
    expect(financial!.relevance).toBe(0.8)
    expect(financial!.tokenBudget).toBeGreaterThan(0)
  })

  it('modules with relevance < 0.1 are excluded (except critical)', () => {
    // Neutral query with no entity mentions, no signals
    const result = allocateContextBudget('hello', 10000, makeContext())
    const entityDossier = findModule(result, 'entity_dossier')
    const decisionMemory = findModule(result, 'decision_memory')
    const financialMemory = findModule(result, 'financial_memory')
    // entity_dossier has 0 relevance with no entities → excluded
    expect(entityDossier).toBeUndefined()
    // decision_memory has 0 relevance with no signals → excluded
    expect(decisionMemory).toBeUndefined()
    // financial_memory has 0 relevance with no signals → excluded
    expect(financialMemory).toBeUndefined()
    // fiduciary always present
    expect(findModule(result, 'fiduciary')).toBeDefined()
  })

  it('total allocation does not exceed totalBudget', () => {
    const ctx = makeContext({
      entityMentions: ['Alice', 'Bob', 'Carol'],
      hasFinancialSignals: true,
      hasDecisionSignals: true,
      hasTemporalSignals: true,
    })
    const result = allocateContextBudget('Should I send the invoice by the deadline?', 5000, ctx)
    const total = result.reduce((sum, a) => sum + a.tokenBudget, 0)
    expect(total).toBeLessThanOrEqual(5000)
  })

  it('respects minTokens for allocated modules', () => {
    const ctx = makeContext({
      entityMentions: ['Alice'],
      hasFinancialSignals: true,
      hasDecisionSignals: true,
      hasTemporalSignals: true,
    })
    const result = allocateContextBudget('full context query', 50000, ctx)
    for (const alloc of result) {
      const moduleDef = MEMORY_MODULES.find((m) => m.name === alloc.moduleName)
      if (moduleDef) {
        expect(alloc.tokenBudget).toBeGreaterThanOrEqual(moduleDef.minTokens)
      }
    }
  })

  it('respects maxTokens for allocated modules', () => {
    const ctx = makeContext({
      entityMentions: ['Alice', 'Bob', 'Carol'],
      hasFinancialSignals: true,
      hasDecisionSignals: true,
      hasTemporalSignals: true,
    })
    const result = allocateContextBudget('full context query', 100000, ctx)
    for (const alloc of result) {
      const moduleDef = MEMORY_MODULES.find((m) => m.name === alloc.moduleName)
      if (moduleDef) {
        expect(alloc.tokenBudget).toBeLessThanOrEqual(moduleDef.maxTokens)
      }
    }
  })

  it('uses default MEMORY_MODULES when none provided', () => {
    const result = allocateContextBudget('hello', 5000, makeContext())
    // Should have at least fiduciary + modules above 0.1 threshold
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('accepts custom modules override', () => {
    const customModules: MemoryModule[] = [
      {
        name: 'custom_a',
        priority: 'high',
        minTokens: 100,
        maxTokens: 500,
        scoreRelevance: () => 0.9,
      },
    ]
    const result = allocateContextBudget('test', 1000, makeContext(), customModules)
    expect(result).toHaveLength(1)
    expect(result[0].moduleName).toBe('custom_a')
  })

  it('sorts allocations by effective score descending', () => {
    const ctx = makeContext({
      entityMentions: ['Alice'],
      hasFinancialSignals: true,
      hasTemporalSignals: true,
    })
    const result = allocateContextBudget('invoice deadline', 20000, ctx)
    // Verify descending order of effective scores
    for (let i = 1; i < result.length; i++) {
      const prevModule = MEMORY_MODULES.find((m) => m.name === result[i - 1].moduleName)
      const currModule = MEMORY_MODULES.find((m) => m.name === result[i].moduleName)
      if (prevModule && currModule) {
        const prevScore = result[i - 1].relevance * PRIORITY_WEIGHTS[prevModule.priority]
        const currScore = result[i].relevance * PRIORITY_WEIGHTS[currModule.priority]
        expect(prevScore).toBeGreaterThanOrEqual(currScore)
      }
    }
  })

  it('handles zero budget gracefully', () => {
    const result = allocateContextBudget('hello', 0, makeContext())
    const total = result.reduce((sum, a) => sum + a.tokenBudget, 0)
    expect(total).toBe(0)
  })
})

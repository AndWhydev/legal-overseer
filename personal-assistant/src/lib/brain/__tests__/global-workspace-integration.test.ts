import { describe, it, expect } from 'vitest'
import {
  allocateContextBudget,
  detectModuleContext,
  MEMORY_MODULES,
} from '../global-workspace'

describe('Global Workspace — competitive allocation', () => {
  it('returns non-empty allocations for a typical query', () => {
    const query = 'What did Andy say about the invoice last week?'
    const context = detectModuleContext(query, ['Andy'])
    const allocations = allocateContextBudget(query, 8000, context)

    expect(allocations.length).toBeGreaterThan(0)
    // Total allocated should not exceed budget
    const total = allocations.reduce((sum, a) => sum + a.tokenBudget, 0)
    expect(total).toBeLessThanOrEqual(8000)
  })

  it('boosts entity_dossier module for entity-heavy queries', () => {
    const entityQuery = 'Tell me about Andy, Sarah, and Mike'
    const entityContext = detectModuleContext(entityQuery, ['Andy', 'Sarah', 'Mike'])
    const entityAllocations = allocateContextBudget(entityQuery, 8000, entityContext)

    const genericQuery = 'What time is it?'
    const genericContext = detectModuleContext(genericQuery, [])
    const genericAllocations = allocateContextBudget(genericQuery, 8000, genericContext)

    const dossierEntity = entityAllocations.find((a) => a.moduleName === 'entity_dossier')
    const dossierGeneric = genericAllocations.find((a) => a.moduleName === 'entity_dossier')

    // Entity-heavy query should include dossier; generic should not
    expect(dossierEntity).toBeDefined()
    expect(dossierEntity!.relevance).toBeGreaterThan(0)
    // Generic query has no entity mentions so dossier relevance = 0 → filtered out
    expect(dossierGeneric).toBeUndefined()
  })

  it('boosts temporal_memory module for calendar queries', () => {
    const calendarQuery = 'What meetings do I have scheduled for next week?'
    const calendarContext = detectModuleContext(calendarQuery, [])
    const calendarAllocations = allocateContextBudget(calendarQuery, 8000, calendarContext)

    const nonCalendarQuery = 'Tell me a joke'
    const nonCalendarContext = detectModuleContext(nonCalendarQuery, [])
    const nonCalendarAllocations = allocateContextBudget(nonCalendarQuery, 8000, nonCalendarContext)

    const temporalCalendar = calendarAllocations.find((a) => a.moduleName === 'temporal_memory')
    const temporalNon = nonCalendarAllocations.find((a) => a.moduleName === 'temporal_memory')

    expect(temporalCalendar).toBeDefined()
    expect(temporalCalendar!.relevance).toBeGreaterThanOrEqual(0.7)

    // Non-calendar still gets temporal (baseline 0.3) but lower relevance
    expect(temporalNon).toBeDefined()
    expect(temporalNon!.relevance).toBeLessThan(temporalCalendar!.relevance)
  })

  it('boosts financial_memory for invoice queries', () => {
    const query = 'Show me the latest invoice from Stripe'
    const context = detectModuleContext(query, [])
    const allocations = allocateContextBudget(query, 8000, context)

    const financial = allocations.find((a) => a.moduleName === 'financial_memory')
    expect(financial).toBeDefined()
    expect(financial!.relevance).toBeGreaterThanOrEqual(0.8)
  })

  it('always includes fiduciary module (critical priority)', () => {
    const query = 'hello'
    const context = detectModuleContext(query, [])
    const allocations = allocateContextBudget(query, 8000, context)

    const fiduciary = allocations.find((a) => a.moduleName === 'fiduciary')
    expect(fiduciary).toBeDefined()
    expect(fiduciary!.relevance).toBe(1.0)
  })

  it('respects total budget constraint even with many relevant modules', () => {
    const query = 'Should I pay the invoice for Andy by the deadline next week?'
    const context = detectModuleContext(query, ['Andy'])
    // Very small budget
    const allocations = allocateContextBudget(query, 1000, context)

    const total = allocations.reduce((sum, a) => sum + a.tokenBudget, 0)
    expect(total).toBeLessThanOrEqual(1000)
  })

  describe('detectModuleContext', () => {
    it('detects financial signals', () => {
      const ctx = detectModuleContext('How much was the invoice?')
      expect(ctx.hasFinancialSignals).toBe(true)
      expect(ctx.hasDecisionSignals).toBe(false)
    })

    it('detects decision signals', () => {
      const ctx = detectModuleContext('Should I choose option A or B?')
      expect(ctx.hasDecisionSignals).toBe(true)
    })

    it('detects temporal signals', () => {
      const ctx = detectModuleContext('What is due by next week?')
      expect(ctx.hasTemporalSignals).toBe(true)
    })
  })
})

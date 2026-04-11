import { describe, it, expect } from 'vitest'
import { TokenBudgetManager, BUDGET_PRESETS } from '../token-budget-manager'

describe('TokenBudgetManager', () => {
  describe('budget presets', () => {
    it('standard preset is 48000', () => {
      expect(BUDGET_PRESETS.standard).toBe(48_000)
    })

    it('dynamic_workspace preset is 200000', () => {
      expect(BUDGET_PRESETS.dynamic_workspace).toBe(200_000)
    })

    it('fromPreset creates manager with correct budget', () => {
      const standard = TokenBudgetManager.fromPreset('standard')
      expect(standard.getBudget()).toBe(48_000)

      const workspace = TokenBudgetManager.fromPreset('dynamic_workspace')
      expect(workspace.getBudget()).toBe(200_000)
    })

    it('fromPreset defaults to standard when no argument', () => {
      const mgr = TokenBudgetManager.fromPreset()
      expect(mgr.getBudget()).toBe(48_000)
    })
  })

  describe('executionContext tier allocation', () => {
    it('allocates executionContext tier when provided', () => {
      const mgr = TokenBudgetManager.fromPreset('dynamic_workspace')
      const result = mgr.allocate([
        { name: 'systemPrompt', content: 'a'.repeat(3500), priority: 1, minTokens: 500, maxTokens: 5000, compressible: false },
        { name: 'entityContext', content: 'b'.repeat(7000), priority: 2, minTokens: 500, maxTokens: 5000, compressible: true },
        { name: 'recentTurns', content: 'c'.repeat(3500), priority: 3, minTokens: 200, maxTokens: 2000, compressible: true },
        { name: 'compressedHistory', content: '', priority: 4, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'keyFacts', content: '', priority: 5, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'pendingActions', content: '', priority: 6, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'retrievedContext', content: 'd'.repeat(7000), priority: 7, minTokens: 500, maxTokens: 10000, compressible: true },
        { name: 'skillPrompts', content: '', priority: 8, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'executionContext', content: 'e'.repeat(70000), priority: 3, minTokens: 1000, maxTokens: 50000, compressible: true },
      ])
      expect(result.executionContext).toBeGreaterThan(0)
      expect(result.budget).toBe(200_000)
      expect(result.total).toBeLessThanOrEqual(result.budget)
    })

    it('executionContext defaults to 0 when not provided', () => {
      const mgr = new TokenBudgetManager(48_000)
      const result = mgr.allocate([
        { name: 'systemPrompt', content: 'test', priority: 1, minTokens: 0, maxTokens: 1000, compressible: false },
        { name: 'entityContext', content: '', priority: 2, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'recentTurns', content: '', priority: 3, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'compressedHistory', content: '', priority: 4, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'keyFacts', content: '', priority: 5, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'pendingActions', content: '', priority: 6, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'retrievedContext', content: '', priority: 7, minTokens: 0, maxTokens: 0, compressible: true },
        { name: 'skillPrompts', content: '', priority: 8, minTokens: 0, maxTokens: 0, compressible: true },
      ])
      expect(result.executionContext).toBe(0)
    })
  })

  describe('backward compatibility', () => {
    it('default constructor still uses 48000 budget', () => {
      const mgr = new TokenBudgetManager()
      expect(mgr.getBudget()).toBe(48_000)
    })

    it('explicit budget parameter still works', () => {
      const mgr = new TokenBudgetManager(100_000)
      expect(mgr.getBudget()).toBe(100_000)
    })
  })
})

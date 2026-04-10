import { describe, it, expect } from 'vitest'
import {
  createCostBudget,
  recordTokens,
  recordSessionTime,
  checkBudget,
  preFlightBudgetCheck,
} from '../cost-monitor'

// ---------------------------------------------------------------------------
// createCostBudget
// ---------------------------------------------------------------------------

describe('createCostBudget', () => {
  it('creates budget with default base ($0.50) and LTV multiplier 1.0', () => {
    const budget = createCostBudget(1.0)
    expect(budget.maxBudgetUsd).toBeCloseTo(0.5)
    expect(budget.spentUsd).toBe(0)
    expect(budget.sessionMinutes).toBe(0)
  })

  it('scales budget with LTV multiplier', () => {
    const budget = createCostBudget(3.0)
    expect(budget.maxBudgetUsd).toBeCloseTo(1.5)
  })

  it('accepts custom base budget override', () => {
    const budget = createCostBudget(1.0, 2.0)
    expect(budget.maxBudgetUsd).toBeCloseTo(2.0)
  })

  it('clamps LTV multiplier to minimum 0.1', () => {
    const budget = createCostBudget(0.01)
    expect(budget.maxBudgetUsd).toBeCloseTo(0.05) // $0.50 * 0.1
  })

  it('clamps LTV multiplier to maximum 10.0', () => {
    const budget = createCostBudget(100.0)
    expect(budget.maxBudgetUsd).toBeCloseTo(5.0) // $0.50 * 10.0
  })
})

// ---------------------------------------------------------------------------
// recordTokens + checkBudget
// ---------------------------------------------------------------------------

describe('recordTokens and checkBudget', () => {
  it('accumulates token cost', () => {
    const budget = createCostBudget(1.0)
    recordTokens(budget, 1000) // small cost
    const check = checkBudget(budget)
    expect(check.withinBudget).toBe(true)
    expect(check.utilization).toBeGreaterThan(0)
    expect(check.remaining).toBeLessThan(0.5)
  })

  it('detects budget exceeded', () => {
    const budget = createCostBudget(1.0) // $0.50 budget
    // Simulate spending more than $0.50 worth of tokens
    // At ~$0.003 per 1K input tokens, need ~167K tokens
    // Using a large number to ensure we exceed
    recordTokens(budget, 500_000)
    const check = checkBudget(budget)
    expect(check.withinBudget).toBe(false)
    expect(check.utilization).toBeGreaterThanOrEqual(1.0)
    expect(check.remaining).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// recordSessionTime
// ---------------------------------------------------------------------------

describe('recordSessionTime', () => {
  it('accumulates session time', () => {
    const budget = createCostBudget(1.0)
    recordSessionTime(budget, 5)
    expect(budget.sessionMinutes).toBe(5)
    recordSessionTime(budget, 3)
    expect(budget.sessionMinutes).toBe(8)
  })

  it('session time contributes to cost', () => {
    const budget = createCostBudget(1.0) // $0.50 budget
    recordSessionTime(budget, 60) // 60 minutes of compute
    const check = checkBudget(budget)
    expect(check.utilization).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// preFlightBudgetCheck
// ---------------------------------------------------------------------------

describe('preFlightBudgetCheck', () => {
  it('validates budget can be created', () => {
    const result = preFlightBudgetCheck(1.0)
    expect(result.allowed).toBe(true)
    expect(result.maxBudgetUsd).toBeCloseTo(0.5)
  })

  it('validates budget with high LTV', () => {
    const result = preFlightBudgetCheck(5.0)
    expect(result.allowed).toBe(true)
    expect(result.maxBudgetUsd).toBeCloseTo(2.5)
  })

  it('validates budget with clamped low LTV', () => {
    const result = preFlightBudgetCheck(0.001)
    expect(result.allowed).toBe(true)
    expect(result.maxBudgetUsd).toBeCloseTo(0.05)
  })
})

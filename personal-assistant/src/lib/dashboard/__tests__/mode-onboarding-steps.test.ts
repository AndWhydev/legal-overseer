import { describe, it, expect } from 'vitest'
import {
  MODE_ONBOARDING_STEPS,
  findOnboardingStep,
  getNextStep,
  getOnboardingProgress,
  getStepsForMode,
  isModeOnboardingComplete,
} from '../mode-onboarding-steps'
import type { Mode } from '../mode-store'

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money']

describe('MODE_ONBOARDING_STEPS — invariants', () => {
  it('every mode has at least one step', () => {
    for (const m of ALL_MODES) {
      expect(getStepsForMode(m).length, `${m} should have >= 1 step`).toBeGreaterThan(0)
    }
  })

  it('every step id is unique', () => {
    const ids = MODE_ONBOARDING_STEPS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('per-mode steps are 1-indexed and contiguous', () => {
    for (const m of ALL_MODES) {
      const steps = getStepsForMode(m)
      const orders = steps.map(s => s.order)
      const expected = Array.from({ length: steps.length }, (_, i) => i + 1)
      expect(orders).toEqual(expected)
    }
  })

  it('every mode has at least one required step OR is chat (which is intentionally optional-only)', () => {
    // chat = no required steps (zero setup); inbox/work/money each have at
    // least one gating step. This guards the design intent.
    expect(getStepsForMode('chat').every(s => !s.required)).toBe(true)
    expect(getStepsForMode('inbox').some(s => s.required)).toBe(true)
    expect(getStepsForMode('work').some(s => s.required)).toBe(true)
    expect(getStepsForMode('money').some(s => s.required)).toBe(true)
  })

  it('money has the deepest funnel (3 steps)', () => {
    expect(getStepsForMode('money').length).toBe(3)
  })
})

describe('getStepsForMode', () => {
  it('returns steps sorted by order', () => {
    for (const m of ALL_MODES) {
      const steps = getStepsForMode(m)
      const orders = steps.map(s => s.order)
      const sorted = [...orders].sort((a, b) => a - b)
      expect(orders).toEqual(sorted)
    }
  })

  it('returns only steps for the requested mode', () => {
    const inboxSteps = getStepsForMode('inbox')
    expect(inboxSteps.every(s => s.mode === 'inbox')).toBe(true)
  })
})

describe('getNextStep', () => {
  it('returns the first step when nothing is completed', () => {
    const next = getNextStep('money', [])
    expect(next?.id).toBe('money-1-add-contact')
  })

  it('skips completed steps and returns the next one', () => {
    const next = getNextStep('money', ['money-1-add-contact'])
    expect(next?.id).toBe('money-2-create-invoice-draft')
  })

  it('returns null when every step is complete', () => {
    const allIds = getStepsForMode('inbox').map(s => s.id)
    expect(getNextStep('inbox', allIds)).toBeNull()
  })

  it('ignores completed ids that do not belong to the mode', () => {
    // chat-1 is completed, but we're asking about money — chat-1 isn't in
    // money's funnel, so the first money step is still next.
    const next = getNextStep('money', ['chat-1-ask-first-question'])
    expect(next?.id).toBe('money-1-add-contact')
  })
})

describe('isModeOnboardingComplete', () => {
  it('chat is complete with zero completed steps (no required steps)', () => {
    expect(isModeOnboardingComplete('chat', [])).toBe(true)
  })

  it('inbox is incomplete until the required connect-channel step is done', () => {
    expect(isModeOnboardingComplete('inbox', [])).toBe(false)
    expect(isModeOnboardingComplete('inbox', ['inbox-1-connect-channel'])).toBe(true)
  })

  it('an optional step alone does not complete a mode that has required steps', () => {
    expect(isModeOnboardingComplete('inbox', ['inbox-2-send-test-message'])).toBe(false)
  })

  it('money requires all required steps, not just the first', () => {
    expect(isModeOnboardingComplete('money', ['money-1-add-contact'])).toBe(false)
    expect(
      isModeOnboardingComplete('money', ['money-1-add-contact', 'money-2-create-invoice-draft']),
    ).toBe(true)
  })
})

describe('getOnboardingProgress', () => {
  it('returns 0% when nothing is completed', () => {
    const p = getOnboardingProgress('money', [])
    expect(p).toEqual({ completed: 0, total: 3, percent: 0 })
  })

  it('returns 100% when every step is complete', () => {
    const all = getStepsForMode('money').map(s => s.id)
    expect(getOnboardingProgress('money', all)).toEqual({ completed: 3, total: 3, percent: 100 })
  })

  it('rounds to nearest integer', () => {
    // 1 of 3 = 33.33...% → 33
    expect(getOnboardingProgress('money', ['money-1-add-contact']).percent).toBe(33)
  })

  it('counts optional steps toward progress', () => {
    // inbox-2 is optional but still increments progress.
    const p = getOnboardingProgress('inbox', ['inbox-2-send-test-message'])
    expect(p.completed).toBe(1)
    expect(p.percent).toBe(50)
  })
})

describe('findOnboardingStep', () => {
  it('returns the step with the matching id', () => {
    const step = findOnboardingStep('inbox-1-connect-channel')
    expect(step?.mode).toBe('inbox')
    expect(step?.required).toBe(true)
  })

  it('returns undefined for unknown ids', () => {
    expect(findOnboardingStep('nope')).toBeUndefined()
  })
})

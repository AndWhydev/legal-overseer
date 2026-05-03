/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MODE_RECIPES,
  executeRecipe,
  getRecipeById,
  getRecipesAffectingMode,
  getRecipesByOriginMode,
  isRecipeRegistered,
} from '../mode-recipes'
import {
  SEND_TO_EVENT_NAME,
  _setRegistryForTests,
  _buildAction,
  type SendToAction,
} from '../send-to-registry'
import type { Mode } from '../mode-store'

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money']

describe('MODE_RECIPES — invariants', () => {
  it('every recipe id is unique', () => {
    const ids = MODE_RECIPES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every recipe has at least 2 steps (single-step recipes are just send-to actions)', () => {
    for (const r of MODE_RECIPES) {
      expect(r.steps.length, `${r.id} should have >= 2 steps`).toBeGreaterThanOrEqual(2)
    }
  })

  it('every step references a real send-to action id (no drift)', () => {
    for (const r of MODE_RECIPES) {
      expect(isRecipeRegistered(r), `${r.id} has unregistered step(s)`).toBe(true)
    }
  })

  it('every recipe lists its origin mode in affectedModes', () => {
    for (const r of MODE_RECIPES) {
      expect(r.affectedModes).toContain(r.originMode)
    }
  })

  it('every origin mode has at least one recipe', () => {
    for (const m of ALL_MODES) {
      expect(getRecipesByOriginMode(m).length, `${m} should have >= 1 recipe`).toBeGreaterThan(0)
    }
  })
})

describe('getRecipeById', () => {
  it('returns the recipe with the matching id', () => {
    const r = getRecipeById('overdue-invoice-chase')
    expect(r?.originMode).toBe('money')
  })

  it('returns undefined for unknown id', () => {
    expect(getRecipeById('nope')).toBeUndefined()
  })
})

describe('getRecipesByOriginMode', () => {
  it('filters by origin only, not by affected modes', () => {
    const moneyRecipes = getRecipesByOriginMode('money')
    expect(moneyRecipes.every(r => r.originMode === 'money')).toBe(true)
  })
})

describe('getRecipesAffectingMode', () => {
  it('returns recipes that touch a mode anywhere in their fan-out', () => {
    // The chat-capture-everything recipe originates in chat but affects
    // work — so asking "which recipes affect work?" should include it.
    const workRecipes = getRecipesAffectingMode('work')
    const ids = workRecipes.map(r => r.id)
    expect(ids).toContain('chat-capture-everything')
    expect(ids).toContain('work-bill-and-discuss')
  })
})

describe('executeRecipe — happy path', () => {
  it('fires bb-send-to for each step in order', async () => {
    const events: string[] = []
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { actionId: string }
      events.push(detail.actionId)
    }
    window.addEventListener(SEND_TO_EVENT_NAME, listener)

    const recipe = getRecipeById('inbox-triage-fanout')!
    const result = await executeRecipe(recipe, { messageId: 'msg-42' })

    expect(events).toEqual([
      'inbox-to-work-task',
      'inbox-to-money-invoice',
      'inbox-to-chat',
    ])
    expect(result.executedSteps).toEqual(events)
    expect(result.skippedSteps).toEqual([])

    window.removeEventListener(SEND_TO_EVENT_NAME, listener)
  })

  it('passes the basePayload to every step by default', async () => {
    const captured: Array<{ payload: unknown }> = []
    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { payload: unknown }
      captured.push({ payload: detail.payload })
    }
    window.addEventListener(SEND_TO_EVENT_NAME, listener)

    const recipe = getRecipeById('work-bill-and-discuss')!
    await executeRecipe(recipe, { taskId: 't-1' })

    expect(captured.length).toBe(2)
    expect(captured.every(c => (c.payload as { taskId: string }).taskId === 't-1')).toBe(true)

    window.removeEventListener(SEND_TO_EVENT_NAME, listener)
  })
})

describe('executeRecipe — overrides + skipping', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 'inbox-to-work-task',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'Test',
      }),
      // inbox-to-money-invoice is intentionally NOT registered — recipe
      // should skip this step and surface it in skippedSteps.
      _buildAction({
        id: 'inbox-to-chat',
        sourceMode: 'inbox',
        targetMode: 'chat',
        label: 'Test',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('skips steps whose action id is not registered and reports them', async () => {
    const recipe = getRecipeById('inbox-triage-fanout')!
    const result = await executeRecipe(recipe, { messageId: 'm' })

    expect(result.executedSteps).toEqual(['inbox-to-work-task', 'inbox-to-chat'])
    expect(result.skippedSteps).toEqual([
      { sendToActionId: 'inbox-to-money-invoice', reason: 'action not found in send-to registry' },
    ])
  })

  it('routes through overrides when provided, bypassing the default event dispatch', async () => {
    const override = vi.fn()
    const listener = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    const recipe = getRecipeById('inbox-triage-fanout')!
    await executeRecipe(recipe, { messageId: 'm' }, { 'inbox-to-work-task': override })

    expect(override).toHaveBeenCalledOnce()
    expect(override).toHaveBeenCalledWith({ sourceMode: 'inbox', payload: { messageId: 'm' } })

    // The other registered step (inbox-to-chat, no override) still dispatches.
    expect(listener).toHaveBeenCalledTimes(1)

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })
})

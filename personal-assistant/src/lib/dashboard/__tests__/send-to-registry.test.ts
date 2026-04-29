/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SEND_TO_EVENT_NAME,
  _setRegistryForTests,
  _buildAction,
  type SendToAction,
  executeSendToAction,
  findSendToAction,
  getSendToActions,
} from '../send-to-registry'

describe('send-to-registry — built-in actions', () => {
  it('exposes at least one action per source mode', () => {
    const modes = ['chat', 'inbox', 'work', 'money'] as const
    for (const m of modes) {
      const actions = getSendToActions(m, {})
      expect(actions.length, `${m} should have at least 1 action`).toBeGreaterThan(0)
    }
  })

  it('never produces source==target actions', () => {
    const modes = ['chat', 'inbox', 'work', 'money'] as const
    for (const m of modes) {
      for (const a of getSendToActions(m, {})) {
        expect(a.targetMode).not.toBe(a.sourceMode)
      }
    }
  })

  it('every built-in action has a stable id and label', () => {
    const modes = ['chat', 'inbox', 'work', 'money'] as const
    const ids = new Set<string>()
    for (const m of modes) {
      for (const a of getSendToActions(m, {})) {
        expect(a.id).toBeTruthy()
        expect(a.label).toBeTruthy()
        ids.add(a.id)
      }
    }
    // All ids unique
    const total = (['chat', 'inbox', 'work', 'money'] as const)
      .reduce((sum, m) => sum + getSendToActions(m, {}).length, 0)
    expect(ids.size).toBe(total)
  })

  it('inbox includes a path to work and to money', () => {
    const inbox = getSendToActions('inbox', {})
    const targets = inbox.map(a => a.targetMode)
    expect(targets).toContain('work')
    expect(targets).toContain('money')
  })
})

describe('findSendToAction', () => {
  it('returns the action with the given id', () => {
    const a = findSendToAction('inbox-to-work-task')
    expect(a?.sourceMode).toBe('inbox')
    expect(a?.targetMode).toBe('work')
  })

  it('returns undefined for unknown id', () => {
    expect(findSendToAction('nope')).toBeUndefined()
  })
})

describe('buildAction validation', () => {
  it('throws when sourceMode === targetMode', () => {
    expect(() =>
      _buildAction({ id: 'self', sourceMode: 'inbox', targetMode: 'inbox', label: 'self' }),
    ).toThrow(/must differ/)
  })
})

describe('default handler dispatches bb-send-to event', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 'test-inbox-to-work',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'Test',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('fires bb-send-to with the canonical envelope', () => {
    const listener = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    const action = findSendToAction('test-inbox-to-work')!
    executeSendToAction(action, { messageId: 'msg-1' })

    expect(listener).toHaveBeenCalledOnce()
    const event = listener.mock.calls[0][0] as CustomEvent
    expect(event.detail).toEqual({
      actionId: 'test-inbox-to-work',
      sourceMode: 'inbox',
      targetMode: 'work',
      payload: { messageId: 'msg-1' },
    })

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })

  it('overrides bypass the default event-dispatch handler', () => {
    const listener = vi.fn()
    const override = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    const action = findSendToAction('test-inbox-to-work')!
    executeSendToAction(action, { messageId: 'msg-2' }, { 'test-inbox-to-work': override })

    expect(override).toHaveBeenCalledOnce()
    expect(override).toHaveBeenCalledWith({
      sourceMode: 'inbox',
      payload: { messageId: 'msg-2' },
    })
    expect(listener).not.toHaveBeenCalled()

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })
})

describe('applies predicate', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 'gated',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'Gated',
        applies: (ctx) => (ctx.payload as { hasContact?: boolean }).hasContact === true,
      }),
      _buildAction({
        id: 'always',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'Always',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('filters out actions whose applies predicate returns false', () => {
    const ids = getSendToActions('inbox', { hasContact: false }).map(a => a.id)
    expect(ids).toContain('always')
    expect(ids).not.toContain('gated')
  })

  it('includes gated actions when predicate matches', () => {
    const ids = getSendToActions('inbox', { hasContact: true }).map(a => a.id)
    expect(ids).toContain('gated')
    expect(ids).toContain('always')
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSendTo } from '../use-send-to'
import {
  SEND_TO_EVENT_NAME,
  _buildAction,
  _setRegistryForTests,
  type SendToAction,
} from '@/lib/dashboard/send-to-registry'

describe('useSendTo', () => {
  let originalRegistry: SendToAction[]

  beforeEach(() => {
    originalRegistry = _setRegistryForTests([
      _buildAction({
        id: 'test-inbox-work',
        sourceMode: 'inbox',
        targetMode: 'work',
        label: 'inbox→work',
      }),
      _buildAction({
        id: 'test-inbox-money',
        sourceMode: 'inbox',
        targetMode: 'money',
        label: 'inbox→money',
      }),
      _buildAction({
        id: 'test-money-chat',
        sourceMode: 'money',
        targetMode: 'chat',
        label: 'money→chat',
      }),
    ])
  })

  afterEach(() => {
    _setRegistryForTests(originalRegistry)
  })

  it('returns actions for the given source mode', () => {
    const { result } = renderHook(() => useSendTo('inbox', {}))
    expect(result.current.actions.map(a => a.id)).toEqual(['test-inbox-work', 'test-inbox-money'])
  })

  it('returns no actions when sourceMode is undefined or null', () => {
    const r1 = renderHook(() => useSendTo(undefined, {}))
    expect(r1.result.current.actions).toEqual([])
    const r2 = renderHook(() => useSendTo(null, {}))
    expect(r2.result.current.actions).toEqual([])
  })

  it('execute fires bb-send-to with the canonical detail', () => {
    const listener = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    const { result } = renderHook(() => useSendTo('inbox', { foo: 1 }))
    act(() => {
      void result.current.execute(result.current.actions[0])
    })

    expect(listener).toHaveBeenCalledOnce()
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail
    expect(detail).toMatchObject({
      actionId: 'test-inbox-work',
      sourceMode: 'inbox',
      targetMode: 'work',
      payload: { foo: 1 },
    })

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })

  it('overrides intercept the default handler', () => {
    const listener = vi.fn()
    const override = vi.fn()
    window.addEventListener(SEND_TO_EVENT_NAME, listener as EventListener)

    const { result } = renderHook(() =>
      useSendTo('inbox', { foo: 2 }, { 'test-inbox-work': override }),
    )
    act(() => {
      void result.current.execute(result.current.actions[0])
    })

    expect(override).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()

    window.removeEventListener(SEND_TO_EVENT_NAME, listener as EventListener)
  })

  it('updates actions list when sourceMode changes', () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'inbox' | 'money' }) => useSendTo(mode, {}),
      { initialProps: { mode: 'inbox' as 'inbox' | 'money' } },
    )
    expect(result.current.actions.length).toBe(2)
    rerender({ mode: 'money' })
    expect(result.current.actions.map(a => a.id)).toEqual(['test-money-chat'])
  })
})

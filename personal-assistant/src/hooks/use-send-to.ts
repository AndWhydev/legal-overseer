/**
 * useSendTo — convenience hook around the send-to registry.
 *
 * Returns the filtered action list for the current source mode + payload, plus
 * a stable `execute` callback that respects per-component overrides.
 *
 * Usage:
 *   const { actions, execute } = useSendTo('inbox', message)
 *   <ContextMenu items={actions.map(a => ({ label: a.label, onClick: () => execute(a) }))} />
 */

'use client'

import { useCallback, useMemo } from 'react'
import type { Mode } from '@/lib/dashboard/mode-store'
import {
  type SendToAction,
  type SendToContext,
  executeSendToAction,
  getSendToActions,
} from '@/lib/dashboard/send-to-registry'

export type SendToOverrides<TPayload> = Record<
  string,
  (ctx: SendToContext<TPayload>) => void | Promise<void>
>

export interface UseSendToResult<TPayload> {
  actions: SendToAction<TPayload>[]
  execute: (action: SendToAction<TPayload>) => void | Promise<void>
}

export function useSendTo<TPayload>(
  sourceMode: Mode | undefined | null,
  payload: TPayload,
  overrides?: SendToOverrides<TPayload>,
): UseSendToResult<TPayload> {
  const actions = useMemo(
    () => (sourceMode ? getSendToActions<TPayload>(sourceMode, payload) : []),
    [sourceMode, payload],
  )

  const execute = useCallback(
    (action: SendToAction<TPayload>) => executeSendToAction(action, payload, overrides),
    [payload, overrides],
  )

  return { actions, execute }
}

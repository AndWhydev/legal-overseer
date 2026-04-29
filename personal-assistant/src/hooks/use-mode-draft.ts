/**
 * useModeDraft — Bind a form's value to per-mode draft persistence.
 *
 * On mount (and when the draft key changes), loads any existing draft and
 * passes it to `onLoad`. As the form value changes, debounced-saves it back.
 *
 * Mode is a *prior*, not a wall: drafts are scoped to (userId, mode, draftType)
 * so switching modes doesn't trample work-in-progress in the other mode, but
 * a single form can opt in or out via the `enabled` flag.
 *
 * Usage:
 *   const [text, setText] = useState('')
 *   useModeDraft({
 *     userId, mode: 'inbox', draftType: 'reply',
 *     value: text, onLoad: (record) => setText(record.value),
 *   })
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import type { Mode } from '@/lib/dashboard/mode-store'
import {
  type DraftRecord,
  clearDraft,
  loadDraft,
  saveDraft,
} from '@/lib/dashboard/draft-store'

export interface UseModeDraftOptions<T> {
  userId: string | null | undefined
  mode: Mode | null | undefined
  draftType: string
  /** Current form value to persist. Changes trigger a debounced save. */
  value: T
  /** Called once with any existing draft when the hook mounts or the key changes. */
  onLoad?: (record: DraftRecord<T>) => void
  /** Debounce window in ms before a save fires. Default 500. */
  debounceMs?: number
  /** Skip persistence entirely when false. Default true. */
  enabled?: boolean
}

export interface UseModeDraftResult {
  /** Wipe the persisted draft for the current key. */
  clear: () => void
  /** Epoch ms of the most recent save in this session, or null. */
  savedAt: number | null
}

export function useModeDraft<T>(opts: UseModeDraftOptions<T>): UseModeDraftResult {
  const {
    userId,
    mode,
    draftType,
    value,
    onLoad,
    debounceMs = 500,
    enabled = true,
  } = opts

  const [savedAt, setSavedAt] = useState<number | null>(null)
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad

  const active = !!(enabled && userId && mode && draftType)
  const draftKey = active ? { userId: userId!, mode: mode!, draftType } : null
  const keyHash = draftKey
    ? `${draftKey.userId}:${draftKey.mode}:${draftKey.draftType}`
    : null

  // Load on mount / when the key changes.
  useEffect(() => {
    if (!draftKey) return
    const existing = loadDraft<T>(draftKey)
    if (existing && onLoadRef.current) onLoadRef.current(existing)
    // We intentionally ignore changes to draftKey identity beyond keyHash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyHash])

  // Tracks whether this key has seen a real value change since mount/key-switch.
  // We MUST NOT persist the initial mount value — otherwise a form rendered with
  // its default value (e.g. empty string) would silently overwrite the loaded
  // draft 500ms after mount, even when the caller never typed anything.
  const seenValueChangeForKeyRef = useRef<string | null>(null)

  // Debounced save on value change. Skips the first run after a key switch so
  // the initial render doesn't blow away the draft we just loaded.
  useEffect(() => {
    if (!draftKey || keyHash === null) return
    if (seenValueChangeForKeyRef.current !== keyHash) {
      seenValueChangeForKeyRef.current = keyHash
      return
    }
    const handle = setTimeout(() => {
      saveDraft<T>(draftKey, value)
      setSavedAt(Date.now())
    }, debounceMs)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyHash, value, debounceMs])

  return {
    clear: () => {
      if (!draftKey) return
      clearDraft(draftKey)
      setSavedAt(null)
    },
    savedAt,
  }
}

/**
 * draft-store.ts — Per-mode draft persistence layer.
 *
 * Auto-saves form state (a reply being composed, a task being filled in, an
 * invoice being drafted) keyed by `(userId, mode, draftType)`. Switching modes
 * doesn't lose work — coming back to the mode restores the draft.
 *
 * Storage: localStorage. Single JSON record per key. Synchronous reads, sync
 * writes. SSR-safe (no-op when `window` is undefined).
 *
 * Key shape: `bitbit-draft:{userId}:{mode}:{draftType}`
 *
 * Hide the machinery: drafts are never exposed as a UI concept beyond "your
 * unfinished work is here when you come back". No timestamps shown unless a
 * caller opts in via `loadDraft().savedAt`.
 */

import type { Mode } from './mode-store'

const STORAGE_KEY_PREFIX = 'bitbit-draft:'

export interface DraftKey {
  userId: string
  mode: Mode
  draftType: string
}

export interface DraftRecord<T> {
  value: T
  /** Epoch milliseconds. */
  savedAt: number
}

export interface DraftSummary {
  mode: Mode
  draftType: string
  savedAt: number
}

const VALID_MODES: ReadonlySet<string> = new Set(['chat', 'inbox', 'work', 'money'])

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

/** Throw on key components that would corrupt the storage-key format. */
function validateKey(key: DraftKey): void {
  if (!key.userId) throw new Error('draft-store: userId is required')
  if (!VALID_MODES.has(key.mode)) throw new Error(`draft-store: invalid mode "${key.mode}"`)
  if (!key.draftType) throw new Error('draft-store: draftType is required')
  if (key.userId.includes(':') || key.draftType.includes(':')) {
    throw new Error('draft-store: userId/draftType must not contain ":"')
  }
}

export function buildDraftStorageKey(key: DraftKey): string {
  validateKey(key)
  return `${STORAGE_KEY_PREFIX}${key.userId}:${key.mode}:${key.draftType}`
}

/**
 * Parse a storage key back into a DraftKey. Returns null when the key is not
 * a valid draft key (wrong prefix, wrong shape, unknown mode).
 */
export function parseDraftStorageKey(storageKey: string): DraftKey | null {
  if (!storageKey.startsWith(STORAGE_KEY_PREFIX)) return null
  const tail = storageKey.slice(STORAGE_KEY_PREFIX.length)
  // Split into exactly 3 parts: userId, mode, draftType.
  // userId may not contain ':' (validated on save), so a left-anchored split is safe.
  const parts = tail.split(':')
  if (parts.length !== 3) return null
  const [userId, mode, draftType] = parts
  if (!VALID_MODES.has(mode)) return null
  return { userId, mode: mode as Mode, draftType }
}

export function saveDraft<T>(key: DraftKey, value: T): void {
  if (!isStorageAvailable()) return
  const storageKey = buildDraftStorageKey(key)
  const record: DraftRecord<T> = { value, savedAt: Date.now() }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record))
  } catch {
    // Quota exceeded, JSON cycle, etc. Swallow — drafts are best-effort.
  }
}

export function loadDraft<T>(key: DraftKey): DraftRecord<T> | null {
  if (!isStorageAvailable()) return null
  const storageKey = buildDraftStorageKey(key)
  const raw = window.localStorage.getItem(storageKey)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as DraftRecord<T>
    if (parsed && typeof parsed.savedAt === 'number') return parsed
    return null
  } catch {
    // Corrupt entry — drop it so the user doesn't get stuck.
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
    return null
  }
}

export function clearDraft(key: DraftKey): void {
  if (!isStorageAvailable()) return
  try {
    window.localStorage.removeItem(buildDraftStorageKey(key))
  } catch {
    /* ignore */
  }
}

/**
 * Enumerate all draft summaries belonging to a user. Useful for UI hints like
 * "you have unsaved drafts in inbox & money". Returns sorted newest-first.
 */
export function listDraftsForUser(userId: string): DraftSummary[] {
  if (!isStorageAvailable() || !userId) return []
  const summaries: DraftSummary[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const storageKey = window.localStorage.key(i)
    if (!storageKey) continue
    const parsed = parseDraftStorageKey(storageKey)
    if (!parsed || parsed.userId !== userId) continue
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) continue
    try {
      const record = JSON.parse(raw) as DraftRecord<unknown>
      if (typeof record?.savedAt !== 'number') continue
      summaries.push({ mode: parsed.mode, draftType: parsed.draftType, savedAt: record.savedAt })
    } catch {
      /* skip corrupt entries */
    }
  }
  summaries.sort((a, b) => b.savedAt - a.savedAt)
  return summaries
}

/** Test helper: not part of the public API. Wipes all drafts for a user. */
export function _clearAllDraftsForUser(userId: string): void {
  if (!isStorageAvailable() || !userId) return
  const toRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const storageKey = window.localStorage.key(i)
    if (!storageKey) continue
    const parsed = parseDraftStorageKey(storageKey)
    if (parsed?.userId === userId) toRemove.push(storageKey)
  }
  for (const k of toRemove) {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  }
}

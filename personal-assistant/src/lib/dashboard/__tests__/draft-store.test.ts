/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  _clearAllDraftsForUser,
  buildDraftStorageKey,
  clearDraft,
  listDraftsForUser,
  loadDraft,
  parseDraftStorageKey,
  saveDraft,
} from '../draft-store'
import type { Mode } from '../mode-store'

const USER = 'user-abc'
const OTHER_USER = 'user-xyz'

describe('buildDraftStorageKey', () => {
  it('produces the documented format', () => {
    const k = buildDraftStorageKey({ userId: USER, mode: 'inbox', draftType: 'reply' })
    expect(k).toBe('bitbit-draft:user-abc:inbox:reply')
  })

  it('throws on missing userId', () => {
    expect(() => buildDraftStorageKey({ userId: '', mode: 'inbox', draftType: 'reply' })).toThrow()
  })

  it('throws on invalid mode', () => {
    expect(() => buildDraftStorageKey({ userId: USER, mode: 'banana' as Mode, draftType: 'reply' })).toThrow()
  })

  it('throws on missing draftType', () => {
    expect(() => buildDraftStorageKey({ userId: USER, mode: 'inbox', draftType: '' })).toThrow()
  })

  it('throws when userId or draftType contains the separator', () => {
    expect(() => buildDraftStorageKey({ userId: 'a:b', mode: 'inbox', draftType: 'reply' })).toThrow()
    expect(() => buildDraftStorageKey({ userId: USER, mode: 'inbox', draftType: 'a:b' })).toThrow()
  })
})

describe('parseDraftStorageKey', () => {
  it('round-trips a valid key', () => {
    const k = buildDraftStorageKey({ userId: USER, mode: 'money', draftType: 'invoice' })
    expect(parseDraftStorageKey(k)).toEqual({ userId: USER, mode: 'money', draftType: 'invoice' })
  })

  it('returns null for non-draft keys', () => {
    expect(parseDraftStorageKey('bitbit-mode-state')).toBeNull()
    expect(parseDraftStorageKey('bb-theme')).toBeNull()
    expect(parseDraftStorageKey('totally unrelated')).toBeNull()
  })

  it('returns null for malformed draft keys', () => {
    expect(parseDraftStorageKey('bitbit-draft:only-two:parts')).toBeNull()
    expect(parseDraftStorageKey('bitbit-draft:a:bogus-mode:c')).toBeNull()
  })
})

describe('saveDraft / loadDraft round-trip', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null when no draft exists', () => {
    expect(loadDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).toBeNull()
  })

  it('saves and loads a string value', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'hello world')
    const r = loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })
    expect(r?.value).toBe('hello world')
    expect(typeof r?.savedAt).toBe('number')
    expect(r!.savedAt).toBeGreaterThan(0)
  })

  it('saves and loads a structured object', () => {
    const draft = { title: 'Ship m3', priority: 'high', tags: ['drafts', 'modes'] }
    saveDraft({ userId: USER, mode: 'work', draftType: 'task' }, draft)
    const r = loadDraft<typeof draft>({ userId: USER, mode: 'work', draftType: 'task' })
    expect(r?.value).toEqual(draft)
  })

  it('overwrites the previous draft', () => {
    const key = { userId: USER, mode: 'inbox' as Mode, draftType: 'reply' }
    saveDraft(key, 'first')
    saveDraft(key, 'second')
    expect(loadDraft<string>(key)?.value).toBe('second')
  })

  it('isolates drafts by mode', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'inbox text')
    saveDraft({ userId: USER, mode: 'chat', draftType: 'reply' }, 'chat text')
    expect(loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('inbox text')
    expect(loadDraft<string>({ userId: USER, mode: 'chat', draftType: 'reply' })?.value).toBe('chat text')
  })

  it('isolates drafts by user', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'mine')
    saveDraft({ userId: OTHER_USER, mode: 'inbox', draftType: 'reply' }, 'theirs')
    expect(loadDraft<string>({ userId: USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('mine')
    expect(loadDraft<string>({ userId: OTHER_USER, mode: 'inbox', draftType: 'reply' })?.value).toBe('theirs')
  })

  it('drops corrupt entries on load', () => {
    const storageKey = buildDraftStorageKey({ userId: USER, mode: 'inbox', draftType: 'reply' })
    window.localStorage.setItem(storageKey, '{not valid json')
    expect(loadDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).toBeNull()
    // Corrupt entry should be removed so it doesn't fail again.
    expect(window.localStorage.getItem(storageKey)).toBeNull()
  })
})

describe('clearDraft', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes a saved draft', () => {
    const key = { userId: USER, mode: 'work' as Mode, draftType: 'task' }
    saveDraft(key, { title: 't' })
    expect(loadDraft(key)).not.toBeNull()
    clearDraft(key)
    expect(loadDraft(key)).toBeNull()
  })

  it('is a no-op when no draft exists', () => {
    expect(() => clearDraft({ userId: USER, mode: 'inbox', draftType: 'reply' })).not.toThrow()
  })
})

describe('listDraftsForUser', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns empty for users with no drafts', () => {
    expect(listDraftsForUser(USER)).toEqual([])
  })

  it('returns empty for empty userId', () => {
    expect(listDraftsForUser('')).toEqual([])
  })

  it('returns one summary per (mode, draftType) for the user', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'a')
    saveDraft({ userId: USER, mode: 'money', draftType: 'invoice' }, { amount: 100 })
    saveDraft({ userId: USER, mode: 'work', draftType: 'task' }, { title: 't' })
    const list = listDraftsForUser(USER)
    expect(list).toHaveLength(3)
    expect(list.map(d => `${d.mode}:${d.draftType}`).sort()).toEqual([
      'inbox:reply', 'money:invoice', 'work:task',
    ])
  })

  it('does not leak drafts across users', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'mine')
    saveDraft({ userId: OTHER_USER, mode: 'inbox', draftType: 'reply' }, 'theirs')
    const list = listDraftsForUser(USER)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ mode: 'inbox', draftType: 'reply' })
  })

  it('sorts newest-first', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'old')
    // Force a later timestamp by writing a record with a known savedAt
    const k = buildDraftStorageKey({ userId: USER, mode: 'work', draftType: 'task' })
    window.localStorage.setItem(k, JSON.stringify({ value: 'new', savedAt: Date.now() + 10000 }))
    const list = listDraftsForUser(USER)
    expect(list[0].mode).toBe('work')
  })

  it('ignores corrupt entries', () => {
    const k = buildDraftStorageKey({ userId: USER, mode: 'inbox', draftType: 'reply' })
    window.localStorage.setItem(k, '{not json')
    expect(listDraftsForUser(USER)).toEqual([])
  })

  it('ignores non-draft localStorage keys', () => {
    window.localStorage.setItem('bb-theme', 'midnight')
    window.localStorage.setItem('bitbit-mode-state', '{}')
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'real draft')
    const list = listDraftsForUser(USER)
    expect(list).toHaveLength(1)
  })
})

describe('_clearAllDraftsForUser', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes only the matching user\'s drafts', () => {
    saveDraft({ userId: USER, mode: 'inbox', draftType: 'reply' }, 'a')
    saveDraft({ userId: USER, mode: 'work', draftType: 'task' }, { title: 't' })
    saveDraft({ userId: OTHER_USER, mode: 'inbox', draftType: 'reply' }, 'b')
    _clearAllDraftsForUser(USER)
    expect(listDraftsForUser(USER)).toEqual([])
    expect(listDraftsForUser(OTHER_USER)).toHaveLength(1)
  })
})

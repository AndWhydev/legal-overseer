import { describe, it, expect } from 'vitest'
import {
  formatModeTitle,
  buildModeFaviconDataURL,
  MODE_TITLE_LABELS,
  MODE_FAVICON_GLYPHS,
  MODE_FAVICON_TINTS,
} from '../mode-tab-badge'
import type { Mode } from '../mode-store'

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money']

describe('formatModeTitle', () => {
  it('returns base title unchanged when mode is undefined', () => {
    expect(formatModeTitle('BitBit', undefined)).toBe('BitBit')
    expect(formatModeTitle('BitBit', null)).toBe('BitBit')
  })

  it('prefixes title with mode label when no unread count', () => {
    expect(formatModeTitle('BitBit', 'inbox')).toBe('[Inbox] BitBit')
    expect(formatModeTitle('BitBit', 'chat')).toBe('[Chat] BitBit')
    expect(formatModeTitle('BitBit', 'work')).toBe('[Work] BitBit')
    expect(formatModeTitle('BitBit', 'money')).toBe('[Money] BitBit')
  })

  it('omits unread badge when unreadCount is 0', () => {
    expect(formatModeTitle('BitBit', 'inbox', 0)).toBe('[Inbox] BitBit')
  })

  it('includes unread count when > 0', () => {
    expect(formatModeTitle('BitBit', 'inbox', 3)).toBe('[Inbox · 3] BitBit')
  })

  it('caps unread count at 99+', () => {
    expect(formatModeTitle('BitBit', 'inbox', 100)).toBe('[Inbox · 99+] BitBit')
    expect(formatModeTitle('BitBit', 'inbox', 9999)).toBe('[Inbox · 99+] BitBit')
  })

  it('shows exactly 99 without overflow', () => {
    expect(formatModeTitle('BitBit', 'inbox', 99)).toBe('[Inbox · 99] BitBit')
  })

  it('preserves the base title text verbatim', () => {
    expect(formatModeTitle('My Custom Title', 'work')).toBe('[Work] My Custom Title')
  })
})

describe('buildModeFaviconDataURL', () => {
  it('returns a data: URL for every mode', () => {
    for (const m of ALL_MODES) {
      const url = buildModeFaviconDataURL(m)
      expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    }
  })

  it('embeds the per-mode glyph in the SVG payload', () => {
    for (const m of ALL_MODES) {
      const decoded = decodeURIComponent(buildModeFaviconDataURL(m))
      expect(decoded).toContain(`>${MODE_FAVICON_GLYPHS[m]}<`)
    }
  })

  it('embeds the per-mode tint in the SVG payload', () => {
    for (const m of ALL_MODES) {
      const decoded = decodeURIComponent(buildModeFaviconDataURL(m))
      expect(decoded).toContain(`fill="${MODE_FAVICON_TINTS[m]}"`)
    }
  })

  it('produces distinct data URLs per mode', () => {
    const urls = new Set(ALL_MODES.map(buildModeFaviconDataURL))
    expect(urls.size).toBe(4)
  })
})

describe('MODE_TITLE_LABELS', () => {
  it('declares a label for every mode', () => {
    for (const m of ALL_MODES) {
      expect(MODE_TITLE_LABELS[m]).toBeTruthy()
    }
  })

  it('uses Title Case for human-readable display', () => {
    for (const m of ALL_MODES) {
      const label = MODE_TITLE_LABELS[m]
      expect(label[0]).toBe(label[0].toUpperCase())
    }
  })
})

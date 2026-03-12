import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME_NAME,
  resolveStoredColorMode,
  resolveStoredThemeName,
} from './defaults'

describe('theme defaults', () => {
  it('defaults first run to light mode with the aurora theme', () => {
    expect(DEFAULT_COLOR_MODE).toBe('light')
    expect(DEFAULT_THEME_NAME).toBe('aurora')
  })

  it('falls back to the premium light defaults when stored values are missing or invalid', () => {
    expect(resolveStoredColorMode(null)).toBe('light')
    expect(resolveStoredColorMode('dark-mode')).toBe('light')
    expect(resolveStoredThemeName(null)).toBe('aurora')
    expect(resolveStoredThemeName('midday')).toBe('aurora')
  })

  it('keeps valid persisted choices intact', () => {
    expect(resolveStoredColorMode('dark')).toBe('dark')
    expect(resolveStoredColorMode('light')).toBe('light')
    expect(resolveStoredThemeName('midnight')).toBe('midnight')
    expect(resolveStoredThemeName('aurora')).toBe('aurora')
    expect(resolveStoredThemeName('light')).toBe('light')
  })
})

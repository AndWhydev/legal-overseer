import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME_NAME,
  resolveStoredColorMode,
  resolveStoredThemeName,
} from './defaults'

describe('theme defaults', () => {
  it('defaults first run to dark mode with the midnight theme', () => {
    expect(DEFAULT_COLOR_MODE).toBe('dark')
    expect(DEFAULT_THEME_NAME).toBe('midnight')
  })

  it('falls back to the dark midnight defaults when stored values are missing or invalid', () => {
    expect(resolveStoredColorMode(null)).toBe('dark')
    expect(resolveStoredColorMode('dark-mode')).toBe('dark')
    expect(resolveStoredThemeName(null)).toBe('midnight')
    expect(resolveStoredThemeName('midday')).toBe('midnight')
  })

  it('keeps valid persisted choices intact', () => {
    expect(resolveStoredColorMode('dark')).toBe('dark')
    expect(resolveStoredColorMode('light')).toBe('light')
    expect(resolveStoredThemeName('midnight')).toBe('midnight')
    expect(resolveStoredThemeName('aurora')).toBe('aurora')
    expect(resolveStoredThemeName('light')).toBe('light')
  })
})
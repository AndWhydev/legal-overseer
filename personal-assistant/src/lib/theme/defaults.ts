export const DEFAULT_COLOR_MODE = 'dark' as const
export const DEFAULT_THEME_NAME = 'midnight' as const

export type ColorMode = 'light' | 'dark'
export type ThemeName = 'midnight' | 'aurora' | 'light'

export function resolveStoredColorMode(value: string | null | undefined): ColorMode {
  return value === 'dark' || value === 'light' ? value : DEFAULT_COLOR_MODE
}

export function resolveStoredThemeName(value: string | null | undefined): ThemeName {
  return value === 'midnight' || value === 'aurora' || value === 'light' ? value : DEFAULT_THEME_NAME
}

/** Map theme → color-scheme class on <html> */
export function themeToColorMode(theme: ThemeName): ColorMode {
  return theme === 'midnight' ? 'dark' : 'light'
}

export function resolveThemeColor(_mode: ColorMode, theme: ThemeName = DEFAULT_THEME_NAME) {
  if (theme === 'midnight') return '#0a0f1a'
  if (theme === 'aurora') return '#f5efe7'
  return '#fafaf9' // light
}
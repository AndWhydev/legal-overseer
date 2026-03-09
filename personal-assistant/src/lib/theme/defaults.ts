export const DEFAULT_COLOR_MODE = 'light' as const
export const DEFAULT_THEME_NAME = 'aurora' as const

export type ColorMode = 'light' | 'dark'
export type ThemeName = 'midnight' | 'aurora'

export function resolveStoredColorMode(value: string | null | undefined): ColorMode {
  return value === 'dark' || value === 'light' ? value : DEFAULT_COLOR_MODE
}

export function resolveStoredThemeName(value: string | null | undefined): ThemeName {
  return value === 'midnight' || value === 'aurora' ? value : DEFAULT_THEME_NAME
}

export function resolveThemeColor(mode: ColorMode, theme: ThemeName = DEFAULT_THEME_NAME) {
  if (mode === 'dark') {
    return '#0a0f1a'
  }

  return theme === 'aurora' ? '#f5efe7' : '#fafaf9'
}

/**
 * BitBit DS — Token registry
 *
 * Typed manifest of every CSS custom property + utility class in the DS.
 * Same contract as `manifest.tsx` for components: humans read the visualizer
 * at /dev/ds/tokens, agents import this file to reason about scale + intent
 * without grep.
 *
 * Adding a new token: define it in the matching CSS file under src/styles/ds/,
 * add an entry below, and the visualizer auto-renders it.
 */

export type TokenCategory =
  | 'typography'
  | 'icon'
  | 'color'
  | 'spacing'
  | 'motion'

export type TokenStatus =
  | 'canonical'
  | 'experimental'
  | 'legacy'
  | 'deprecated'

export interface Token {
  /** Token short name (matches CSS var without leading `--`). */
  name: string
  /** Full CSS custom property reference. */
  cssVar: string
  /** Resolved value as authored in the stylesheet. */
  value: string
  /** What this token means. */
  description: string
  /** Position in scale (use for sort order; lexicographic). */
  scale: string
  /** Lifecycle. */
  status: TokenStatus
  /** Utility class that applies this token, if any. */
  utility?: string
  /** Free-form note for agents (gotchas, when not to use). */
  notes?: string
}

// ─── Typography ──────────────────────────────────────────────────────────

export const typographyTokens: Token[] = [
  {
    name: 'fs-display',
    cssVar: '--fs-display',
    value: 'clamp(40px, 6vw, 72px)',
    description: 'Marketing hero headlines (public pages only)',
    scale: '00',
    status: 'canonical',
    notes: 'Do not use inside the dashboard app.',
  },
  {
    name: 'fs-hero',
    cssVar: '--fs-hero',
    value: 'clamp(32px, 5vw, 56px)',
    description: 'Marketing sub-hero',
    scale: '01',
    status: 'canonical',
  },
  {
    name: 'fs-h1',
    cssVar: '--fs-h1',
    value: '28px',
    description: 'Top-level page heading',
    scale: '02',
    status: 'canonical',
    utility: '.title-h1',
  },
  {
    name: 'fs-h2',
    cssVar: '--fs-h2',
    value: '22px',
    description: 'Section heading',
    scale: '03',
    status: 'canonical',
    utility: '.title-h2',
  },
  {
    name: 'fs-h3',
    cssVar: '--fs-h3',
    value: '18px',
    description: 'Subsection heading',
    scale: '04',
    status: 'canonical',
    utility: '.title-h3',
  },
  {
    name: 'fs-h4',
    cssVar: '--fs-h4',
    value: '16px',
    description: 'Smallest heading; matches body',
    scale: '05',
    status: 'canonical',
    utility: '.title-h4',
  },
  {
    name: 'fs-body',
    cssVar: '--fs-body',
    value: '16px',
    description: 'Default body text',
    scale: '06',
    status: 'canonical',
  },
  {
    name: 'fs-title',
    cssVar: '--fs-title',
    value: '15px',
    description: 'Card / panel / modal titles',
    scale: '07',
    status: 'canonical',
    utility: '.title-card',
  },
  {
    name: 'fs-body-sm',
    cssVar: '--fs-body-sm',
    value: '14px',
    description: 'Compact body, list-row primary text',
    scale: '08',
    status: 'canonical',
  },
  {
    name: 'fs-caption',
    cssVar: '--fs-caption',
    value: '13px',
    description: 'Helper text, secondary meta',
    scale: '09',
    status: 'canonical',
    utility: '.caption',
  },
  {
    name: 'fs-micro',
    cssVar: '--fs-micro',
    value: '12px',
    description: 'Tight inline labels, badge text',
    scale: '10',
    status: 'canonical',
    utility: '.micro',
  },
  {
    name: 'fs-label',
    cssVar: '--fs-label',
    value: '11px',
    description: 'Eyebrow labels, group headers (uppercase)',
    scale: '11',
    status: 'canonical',
    utility: '.eyebrow',
  },
  {
    name: 'fs-nano',
    cssVar: '--fs-nano',
    value: '10px',
    description: 'Smallest legible utility — kbd hints, footer code',
    scale: '12',
    status: 'canonical',
    utility: '.nano',
    notes: 'Use sparingly; legibility floor.',
  },
]

// ─── Icons ───────────────────────────────────────────────────────────────

export const iconTokens: Token[] = [
  {
    name: 'icon-xs',
    cssVar: '--icon-xs',
    value: '12px',
    description: 'Tight inline meta — list-row trailing icons',
    scale: '0',
    status: 'canonical',
    utility: '.icon-xs',
  },
  {
    name: 'icon-sm',
    cssVar: '--icon-sm',
    value: '16px',
    description: 'Default — buttons, list-row leading, inline',
    scale: '1',
    status: 'canonical',
    utility: '.icon-sm',
  },
  {
    name: 'icon-md',
    cssVar: '--icon-md',
    value: '20px',
    description: 'Topbar, primary CTAs, larger buttons',
    scale: '2',
    status: 'canonical',
    utility: '.icon-md',
  },
  {
    name: 'icon-lg',
    cssVar: '--icon-lg',
    value: '24px',
    description: 'Section headers, prominent action icons',
    scale: '3',
    status: 'canonical',
    utility: '.icon-lg',
  },
  {
    name: 'icon-xl',
    cssVar: '--icon-xl',
    value: '32px',
    description: 'Feature icons, empty-state media',
    scale: '4',
    status: 'canonical',
    utility: '.icon-xl',
  },
]

// ─── Color (placeholder — will populate during color sweep) ──────────────

export const colorTokens: Token[] = []

// ─── Spacing (placeholder — Tailwind covers this until we override) ──────

export const spacingTokens: Token[] = []

// ─── Motion (placeholder — comes later) ──────────────────────────────────

export const motionTokens: Token[] = []

// ─── Aggregate ───────────────────────────────────────────────────────────

export const tokens: Record<TokenCategory, Token[]> = {
  typography: typographyTokens,
  icon: iconTokens,
  color: colorTokens,
  spacing: spacingTokens,
  motion: motionTokens,
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function findTokenByName(name: string): Token | undefined {
  for (const list of Object.values(tokens)) {
    const match = list.find((t) => t.name === name)
    if (match) return match
  }
  return undefined
}

export function findTokenByUtility(utility: string): Token | undefined {
  const cleaned = utility.replace(/^\./, '')
  for (const list of Object.values(tokens)) {
    const match = list.find(
      (t) => t.utility?.replace(/^\./, '') === cleaned,
    )
    if (match) return match
  }
  return undefined
}

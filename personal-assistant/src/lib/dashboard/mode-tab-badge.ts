/**
 * mode-tab-badge.ts — Pure helpers for tab title + favicon badging per mode.
 *
 * The browser tab strip and bookmark list are the user's "OS-level" reminder
 * of what mode they're in. We badge both:
 *   - document.title gets a `[Mode]` prefix (or `[Mode · 3]` with unread count)
 *   - <link rel=icon> swaps to a per-mode SVG glyph favicon
 *
 * Hide the machinery: no persona names, no tone labels — just the four mode
 * labels (CHAT/INBOX/WORK/MONEY) the user already sees in the topbar.
 */

import type { Mode } from './mode-store'

/** Tab-strip labels — match topbar.tsx for visual consistency. */
export const MODE_TITLE_LABELS: Record<Mode, string> = {
  chat: 'Chat',
  inbox: 'Inbox',
  work: 'Work',
  money: 'Money',
}

/**
 * Single-glyph favicon initials. Drawn into a 32×32 SVG so the tab strip
 * shows the mode at a glance without depending on emoji rendering.
 */
export const MODE_FAVICON_GLYPHS: Record<Mode, string> = {
  chat: 'C',
  inbox: 'I',
  work: 'W',
  money: '$',
}

/**
 * Per-mode favicon background tints. Subtle — keeps the monochrome design
 * philosophy but gives each tab a distinct hue at thumbnail size.
 */
export const MODE_FAVICON_TINTS: Record<Mode, string> = {
  chat: '#0a0f1a',  // ink — neutral
  inbox: '#0e7490', // teal-700
  work: '#7c2d12',  // brown-800
  money: '#15803d', // green-700
}

/**
 * Format the document title for a given mode.
 *
 * Rules:
 *   - mode undefined → return baseTitle unchanged (flag-off path)
 *   - unread > 0 → `[Inbox · 3] BitBit`
 *   - unread = 0 or undefined → `[Inbox] BitBit`
 */
export function formatModeTitle(
  baseTitle: string,
  mode: Mode | undefined | null,
  unreadCount?: number,
): string {
  if (!mode) return baseTitle
  const label = MODE_TITLE_LABELS[mode]
  const badge =
    typeof unreadCount === 'number' && unreadCount > 0
      ? `[${label} · ${unreadCount > 99 ? '99+' : unreadCount}]`
      : `[${label}]`
  return `${badge} ${baseTitle}`
}

/**
 * Build a 32×32 SVG favicon for the given mode and return it as a data URL.
 *
 * The SVG is monochrome-friendly: rounded square tinted background, white
 * glyph centered. Inline SVG keeps the bundle clean — no extra binary assets.
 */
export function buildModeFaviconDataURL(mode: Mode): string {
  const tint = MODE_FAVICON_TINTS[mode]
  const glyph = MODE_FAVICON_GLYPHS[mode]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="6" fill="${tint}"/>` +
    `<text x="16" y="22" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="20" font-weight="700" fill="#ffffff">${glyph}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

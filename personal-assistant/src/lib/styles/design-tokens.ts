/**
 * BitBit Design Tokens — Monochrome Glassmorphic System
 *
 * Single source of truth for all visual styles. Import these instead of
 * hardcoding rgba() values or duplicating glass patterns.
 *
 * Palette: black → white continuum only. No orange, no blue, no purple.
 * Status colors (green/yellow/red) are the ONLY exception and are used
 * exclusively for semantic meaning (success/warning/error indicators).
 *
 * Usage:
 *   import { S } from '@/lib/styles/design-tokens'
 *   <div style={S.card}>...</div>
 *   <button style={{ ...S.button, ...S.buttonAccent }}>CTA</button>
 */
import type { CSSProperties } from 'react'

// ─── Color Palette (monochrome only) ─────────────────────────────────────────

export const C = {
  // Backgrounds — darkest to lightest (CSS vars flip for light mode)
  bgPage: 'var(--bg-primary, #0a0f1a)',
  bgCard: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  bgCardLight: 'var(--bg-card, rgba(15, 20, 30, 0.35))',
  bgCardHeavy: 'var(--glass-bg-heavy, rgba(12, 16, 24, 0.85))',
  bgElevated: 'var(--bg-elevated, rgba(25, 35, 50, 0.8))',
  bgInput: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  bgOverlay: 'var(--bg-overlay, rgba(0, 0, 0, 0.6))',
  bgHover: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  bgHoverStrong: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))',
  bgListRow: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  bgListRowHover: 'var(--bb-surface-hover, rgba(20, 28, 40, 0.7))',

  // Text — white to dark
  textPrimary: 'var(--text-primary, #F1F5F9)',
  textSecondary: 'var(--text-secondary, #94A3B8)',
  textDim: 'var(--text-dim, #475569)',
  textMuted: 'var(--text-dim, rgba(255, 255, 255, 0.3))',
  textPlaceholder: 'var(--text-secondary, rgba(255, 255, 255, 0.5))',

  // Borders — subtle to strong
  borderSubtle: 'var(--border-subtle, rgba(255, 255, 255, 0.03))',
  borderVisible: 'var(--glass-border, rgba(255, 255, 255, 0.06))',
  borderHover: 'var(--border-active, rgba(255, 255, 255, 0.1))',
  borderFocus: 'var(--border-focus-ring, rgba(255, 255, 255, 0.2))',

  // Status (semantic only — never decorative)
  statusSuccess: '#22c55e',
  statusSuccessBg: 'rgba(34, 197, 94, 0.12)',
  statusWarning: '#eab308',
  statusWarningBg: 'rgba(234, 179, 8, 0.12)',
  statusError: '#ef4444',
  statusErrorBg: 'rgba(239, 68, 68, 0.12)',
} as const

// ─── Shared Values ───────────────────────────────────────────────────────────

const BLUR = 'var(--glass-blur, blur(20px) saturate(1.2))'
const INSET = 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))'
const SHADOW = `var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), ${INSET}`

// ─── Composed Style Objects ──────────────────────────────────────────────────

export const S = {
  // ── Card Surfaces ──

  /** Standard glass card — the default surface for everything */
  card: {
    padding: 20,
    borderRadius: 16,
    background: C.bgCard,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,

  /** Lighter glass card — for nested/secondary surfaces */
  cardLight: {
    padding: 16,
    borderRadius: 12,
    background: C.bgCardLight,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,

  /** Heavy glass — modals, dropdowns, popovers */
  cardHeavy: {
    padding: 20,
    borderRadius: 16,
    background: C.bgCardHeavy,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${C.borderVisible}`,
    boxShadow: `${INSET}, var(--card-shadow, 0 8px 32px rgba(0, 0, 0, 0.4))`,
  } satisfies CSSProperties,

  /** Flush card — no padding (for cards wrapping custom layouts) */
  cardFlush: {
    borderRadius: 16,
    background: C.bgCard,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
    overflow: 'hidden' as const,
  } satisfies CSSProperties,

  // ── Card Sub-sections ──

  cardHeader: {
    padding: '16px 20px',
    borderBottom: `1px solid ${C.borderSubtle}`,
  } satisfies CSSProperties,

  cardTitle: {
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: '-0.01em',
  } satisfies CSSProperties,

  cardBody: {
    padding: 20,
  } satisfies CSSProperties,

  // ── Typography ──

  /** Page-level title */
  title: {
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: '-0.01em',
  } satisfies CSSProperties,

  /** Subtitle / description */
  subtitle: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 4,
  } satisfies CSSProperties,

  /** Section header (uppercase label) */
  sectionLabel: {
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: C.textDim,
    marginBottom: 12,
  } satisfies CSSProperties,

  /** Body text */
  body: {
    fontSize: 16,
    fontWeight: 400,
    color: C.textPrimary,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  /** Secondary text */
  secondary: {
    fontSize: 14,
    fontWeight: 400,
    color: C.textSecondary,
  } satisfies CSSProperties,

  /** Monospace numbers */
  mono: {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: '-0.02em',
  } satisfies CSSProperties,

  // ── Buttons ──

  /** Base button — 40px tall, used as spread base for all variants */
  button: {
    height: 40,
    padding: '0 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  } satisfies CSSProperties,

  /** Primary button — white on dark (monochrome accent), inverts in light mode */
  buttonPrimary: {
    background: 'var(--btn-primary-bg, #F1F5F9)',
    color: 'var(--btn-primary-fg, #0a0f1a)',
  } satisfies CSSProperties,

  /** Ghost button — flat, inside glass surfaces. Subtle stroke for boundary. */
  buttonGhost: {
    background: 'transparent',
    border: `1px solid ${C.borderVisible}`,
    color: C.textPrimary,
  } satisfies CSSProperties,

  /** Soft button — dim fill, inside glass surfaces. No border. */
  buttonSoft: {
    background: C.bgHover,
    border: 'none',
    color: C.textSecondary,
  } satisfies CSSProperties,

  /** Destructive button — for delete/remove actions */
  buttonDestructive: {
    background: C.statusErrorBg,
    color: C.statusError,
  } satisfies CSSProperties,

  // ── Pill / Filter Chip ──

  pill: {
    height: 40,
    padding: '0 16px',
    borderRadius: 9999,
    background: 'var(--pill-inactive-bg, rgba(10, 14, 23, 0.42))',
    backdropFilter: 'blur(22px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
    boxShadow: SHADOW,
    border: 'none',
    fontSize: 14,
    color: C.textSecondary,
    cursor: 'pointer',
    transition: 'all 200ms',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  } satisfies CSSProperties,

  /** Active pill state */
  pillActive: {
    color: C.textPrimary,
    background: 'var(--pill-active-bg, rgba(255, 255, 255, 0.08))',
  } satisfies CSSProperties,

  // ── Input ──

  input: {
    width: '100%',
    height: 40,
    padding: '0 12px',
    borderRadius: 8,
    background: C.bgInput,
    border: `1px solid ${C.borderSubtle}`,
    color: C.textPrimary,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 200ms, box-shadow 200ms',
  } satisfies CSSProperties,

  // ── Badge ──

  badge: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '4px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: C.bgHoverStrong,
    color: C.textSecondary,
  } satisfies CSSProperties,

  // ── List Row ──

  listRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '12px 16px',
    borderRadius: 12,
    background: C.bgListRow,
    backdropFilter: 'blur(26px) saturate(1.15)',
    WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
    boxShadow: SHADOW,
    border: 'none',
    transition: 'background 200ms',
    cursor: 'pointer',
  } satisfies CSSProperties,

  listRowHover: {
    background: C.bgListRowHover,
  } satisfies CSSProperties,

  // ── Divider ──

  divider: {
    height: 1,
    background: C.borderSubtle,
    border: 'none',
    margin: '12px 0',
  } satisfies CSSProperties,

  // ── Empty State ──

  emptyState: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '60px 20px',
    gap: 12,
  } satisfies CSSProperties,

  emptyIcon: {
    color: C.textDim,
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center' as const,
  } satisfies CSSProperties,

  // ── Drawer / Panel ──

  drawerBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    zIndex: 52,
    backdropFilter: 'blur(2px)',
  } satisfies CSSProperties,

  drawerPanel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: 560,
    zIndex: 53,
    background: C.bgPage,
    borderLeft: `1px solid ${C.borderVisible}`,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  } satisfies CSSProperties,

  // ── Noise Overlay (for glow surfaces) ──

  noiseOverlay: {
    position: 'absolute' as const,
    inset: 0,
    borderRadius: 'inherit',
    background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E")`,
    backgroundSize: '100px 100px',
    mixBlendMode: 'overlay' as const,
    pointerEvents: 'none' as const,
    zIndex: 1,
  } satisfies CSSProperties,
} as const

// ─── Status Badge Helper ─────────────────────────────────────────────────────

export function statusBadge(
  status: 'success' | 'warning' | 'error' | 'neutral',
): CSSProperties {
  const map = {
    success: { background: C.statusSuccessBg, color: C.statusSuccess },
    warning: { background: C.statusWarningBg, color: C.statusWarning },
    error: { background: C.statusErrorBg, color: C.statusError },
    neutral: { background: C.bgHoverStrong, color: C.textSecondary },
  }
  return { ...S.badge, ...map[status] }
}

// ─── Hover Helper ────────────────────────────────────────────────────────────

/** Use with useState<string | null> for hover tracking on lists */
export function hoveredRow(
  id: string,
  hoveredId: string | null,
): CSSProperties {
  return {
    ...S.listRow,
    background: hoveredId === id ? C.bgListRowHover : C.bgListRow,
  }
}

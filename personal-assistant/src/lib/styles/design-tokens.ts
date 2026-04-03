/**
 * BitBit Design Tokens — Monochrome Solid System
 *
 * Single source of truth for all visual styles. Import these instead of
 * hardcoding rgba() values or duplicating glass patterns.
 *
 * Palette: black → white continuum only. No orange, no blue, no purple.
 * Status colors (green/yellow/red) are the ONLY exception and are used
 * exclusively for semantic meaning (success/warning/error indicators).
 *
 * Usage:
 *   import { S } from "@/lib/styles/design-tokens"
 *   <div style={S.card}>...</div>
 *   <button style={{ ...S.button, ...S.buttonAccent }}>CTA</button>
 */
import type { CSSProperties } from "react"

// ─── Color Palette (monochrome only) ─────────────────────────────────────────

export const C = {
  // Backgrounds — darkest to lightest (CSS vars flip for light mode)
  bgPage: "var(--bg-primary, #0a0f1a)",
  bgCard: "var(--card)",
  bgCardLight: "var(--secondary)",
  bgCardHeavy: "var(--popover)",
  bgElevated: "var(--elevated)",
  bgInput: "var(--input)",
  bgOverlay: "var(--bg-overlay, rgba(0, 0, 0, 0.6))",
  bgHover: "var(--hover-bg, rgba(255, 255, 255, 0.04))",
  bgHoverStrong: "var(--hover-bg-strong, rgba(255, 255, 255, 0.08))",
  bgListRow: "var(--secondary)",
  bgListRowHover: "var(--elevated)",

  // Text — white to dark
  textPrimary: "var(--text-primary, #F1F5F9)",
  textSecondary: "var(--text-secondary, #94A3B8)",
  textDim: "var(--text-dim, #475569)",
  textMuted: "var(--text-dim, rgba(255, 255, 255, 0.3))",
  textPlaceholder: "var(--text-secondary, rgba(255, 255, 255, 0.5))",

  // Borders — subtle to strong
  borderSubtle: "var(--border-subtle, rgba(255, 255, 255, 0.03))",
  borderVisible: "var(--glass-border, rgba(255, 255, 255, 0.06))",
  borderHover: "var(--border-active, rgba(255, 255, 255, 0.1))",
  borderFocus: "var(--border-focus-ring, rgba(255, 255, 255, 0.2))",

  // Status (semantic only — never decorative)
  statusSuccess: "#22c55e",
  statusSuccessBg: "rgba(34, 197, 94, 0.12)",
  statusWarning: "#eab308",
  statusWarningBg: "rgba(234, 179, 8, 0.12)",
  statusError: "#ef4444",
  statusErrorBg: "rgba(239, 68, 68, 0.12)",
} as const

// ─── Shared Values ───────────────────────────────────────────────────────────

const SHADOW = "var(--card-shadow, 0 2px 8px rgba(0,0,0,0.15))"

// ─── Composed Style Objects ──────────────────────────────────────────────────

export const S = {
  // ── Card Surfaces ──

  /** Standard card — the default surface for everything */
  card: {
    padding: 20,
    borderRadius: 16,
    background: C.bgCard,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,

  /** Lighter card — for nested/secondary surfaces */
  cardLight: {
    padding: 16,
    borderRadius: 12,
    background: C.bgCardLight,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,

  /** Heavy card — modals, dropdowns, popovers */
  cardHeavy: {
    padding: 20,
    borderRadius: 16,
    background: C.bgCardHeavy,
    border: `1px solid ${C.borderVisible}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,

  /** Flush card — no padding (for cards wrapping custom layouts) */
  cardFlush: {
    borderRadius: 16,
    background: C.bgCard,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
    overflow: "hidden" as const,
  } satisfies CSSProperties,

  // ── Card Sub-sections ──

  cardHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${C.borderSubtle}`,
  } satisfies CSSProperties,

  cardTitle: {
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: "-0.01em",
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
    letterSpacing: "-0.01em",
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
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
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
    fontFamily: "var(--font-mono, \"JetBrains Mono\", monospace)",
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,

  // ── Buttons ──

  /** Base button — 40px tall, used as spread base for all variants */
  button: {
    height: 40,
    padding: "0 20px",
    borderRadius: 8,
    border: "none",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 8,
  } satisfies CSSProperties,

  /** Primary button — white on dark (monochrome accent), inverts in light mode */
  buttonPrimary: {
    background: "var(--btn-primary-bg, #F1F5F9)",
    color: "var(--btn-primary-fg, #0a0f1a)",
  } satisfies CSSProperties,

  /** Ghost button — flat, inside surfaces. Subtle stroke for boundary. */
  buttonGhost: {
    background: "transparent",
    border: `1px solid ${C.borderVisible}`,
    color: C.textPrimary,
  } satisfies CSSProperties,

  /** Soft button — dim fill, inside surfaces. No border. */
  buttonSoft: {
    background: C.bgHover,
    border: "none",
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
    padding: "0 16px",
    borderRadius: 9999,
    background: "var(--secondary)",
    boxShadow: SHADOW,
    border: "none",
    fontSize: 14,
    color: C.textSecondary,
    cursor: "pointer",
    transition: "all 200ms",
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 8,
  } satisfies CSSProperties,

  /** Active pill state */
  pillActive: {
    color: C.textPrimary,
    background: "var(--pill-active-bg, rgba(255, 255, 255, 0.08))",
  } satisfies CSSProperties,

  // ── Input ──

  input: {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    background: C.bgInput,
    border: `1px solid ${C.borderSubtle}`,
    color: C.textPrimary,
    fontSize: 14,
    outline: "none",
    transition: "border-color 200ms, box-shadow 200ms",
  } satisfies CSSProperties,

  // ── Badge ──

  badge: {
    display: "inline-flex" as const,
    alignItems: "center" as const,
    padding: "4px 12px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: C.bgHoverStrong,
    color: C.textSecondary,
  } satisfies CSSProperties,

  // ── List Row ──

  listRow: {
    display: "flex" as const,
    alignItems: "center" as const,
    padding: "12px 16px",
    borderRadius: 12,
    background: C.bgListRow,
    boxShadow: SHADOW,
    border: "none",
    transition: "background 200ms",
    cursor: "pointer",
  } satisfies CSSProperties,

  listRowHover: {
    background: C.bgListRowHover,
  } satisfies CSSProperties,

  // ── Divider ──

  divider: {
    height: 1,
    background: C.borderSubtle,
    border: "none",
    margin: "12px 0",
  } satisfies CSSProperties,

  // ── Empty State ──

  emptyState: {
    display: "flex" as const,
    flexDirection: "column" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: "60px 20px",
    gap: 12,
  } satisfies CSSProperties,

  emptyIcon: {
    color: C.textDim,
  } satisfies CSSProperties,

  emptyText: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center" as const,
  } satisfies CSSProperties,

  // ── Drawer / Panel ──

  drawerBackdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    zIndex: 52,
    backdropFilter: "blur(2px)",
  } satisfies CSSProperties,

  drawerPanel: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    maxWidth: 560,
    zIndex: 53,
    background: C.bgPage,
    borderLeft: `1px solid ${C.borderVisible}`,
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden" as const,
  } satisfies CSSProperties,
} as const

// ─── Status Badge Helper ─────────────────────────────────────────────────────

export function statusBadge(
  status: "success" | "warning" | "error" | "neutral",
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

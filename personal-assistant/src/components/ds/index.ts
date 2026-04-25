/**
 * BitBit Design System — public surface.
 *
 * Atomic hierarchy: atoms → molecules → organisms → templates.
 * Single source of truth: ./manifest.ts (typed registry, agent-readable).
 * Live canvas: /dev/ds
 *
 * Discipline: read manifest.ts BEFORE reinventing. If the primitive you
 * need isn't there, propose adding it before rolling your own.
 */

// ── Atoms ────────────────────────────────────────────────────────────────
export {
  StatusDot,
  type StatusDotProps,
  type StatusDotVariant,
} from './atoms/status-dot'
export { Kbd, type KbdProps } from './atoms/kbd'
export { Spinner, type SpinnerProps, type IconSize } from './atoms/spinner'

// ── Molecules ────────────────────────────────────────────────────────────
export { ListRow, type ListRowProps } from './molecules/list-row'

// Re-exports of canonical ui/* compound components — discoverability without duplication
export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'

// ── Manifest (re-exported for agent discovery) ───────────────────────────
export { dsManifest, type DSEntry, type DSTier } from './manifest'

// ── Tokens (re-exported for unified import) ──────────────────────────────
export {
  tokens,
  findTokenByName,
  findTokenByUtility,
  type Token,
  type TokenCategory,
  type TokenStatus,
} from '@/styles/ds/tokens'

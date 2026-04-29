/**
 * mode-entitlements.ts — Modes as SKUs.
 *
 * Each dashboard mode (chat / inbox / work / money) is a unit of entitlement.
 * A workspace's plan tier determines which modes it has access to, and the
 * mode switcher / cross-mode flows consult these entitlements before
 * surfacing a mode.
 *
 * Modes are bundled by tier today (no per-mode add-on Stripe products).
 * Default mapping:
 *   - free     → chat                              (the always-on baseline)
 *   - starter  → chat + inbox                      (read connected channels)
 *   - growth   → chat + inbox + work + money       (full suite)
 *   - scale    → all
 *   - enterprise → all
 *
 * "Mode is a prior, not a wall": the entitlement layer governs *which* tabs
 * show up, but cross-mode "Send to" actions can still target a disabled mode
 * if the destination upsells. Callers decide what to do with `requiredPlan`.
 *
 * NOTE on enforcement scope: this module is the *primitive*. It does not
 * itself enforce anything — server-side API routes that surface mode-scoped
 * data are still responsible for calling `checkModeAccess` (or `isModeEnabled`)
 * before returning data. Hiding tabs in the UI is a UX affordance, not a
 * security boundary. Follow-up PRs will wire the gate into the relevant
 * routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import type { Mode } from '@/lib/dashboard/mode-store'
import { getOrgPlan, type PlanName } from './plan-gates'

// ─── Mode → tier mapping ──────────────────────────────────────────────────────

const ALL_MODES: ReadonlyArray<Mode> = ['chat', 'inbox', 'work', 'money']

/**
 * Which modes are enabled for each plan tier. Order matches mode-switcher
 * canonical order (chat → inbox → work → money) so callers can render this
 * directly without resorting.
 */
export const MODES_BY_PLAN: Readonly<Record<PlanName, ReadonlyArray<Mode>>> = {
  free:       ['chat'],
  starter:    ['chat', 'inbox'],
  growth:     ['chat', 'inbox', 'work', 'money'],
  scale:      ['chat', 'inbox', 'work', 'money'],
  enterprise: ['chat', 'inbox', 'work', 'money'],
}

/**
 * Minimum plan required to unlock each mode. Inverse of MODES_BY_PLAN —
 * useful for "upgrade to unlock this mode" upsell copy.
 */
export const MIN_PLAN_FOR_MODE: Readonly<Record<Mode, PlanName>> = {
  chat:  'free',
  inbox: 'starter',
  work:  'growth',
  money: 'growth',
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ModeAccess {
  allowed: boolean
  /** Plan the workspace currently has. */
  currentPlan: PlanName
  /** Minimum plan required for this mode. */
  requiredPlan: PlanName
}

/**
 * Get the list of modes a workspace is entitled to right now.
 * Errors fall through to the free tier (chat only) — never throws.
 */
export async function getEnabledModes(
  client: SupabaseClient,
  orgId: string,
): Promise<Mode[]> {
  try {
    const plan = await getOrgPlan(client, orgId)
    return [...MODES_BY_PLAN[plan]]
  } catch (err) {
    logger.warn('[mode-entitlements] Failed to read org plan, falling back to free:', err)
    return [...MODES_BY_PLAN.free]
  }
}

/**
 * Synchronous variant for callers that already know the plan (e.g. server
 * components that load it once per request and pass it down).
 */
export function getEnabledModesForPlan(plan: PlanName): Mode[] {
  return [...MODES_BY_PLAN[plan]]
}

/** Is the given mode enabled for this workspace? */
export async function isModeEnabled(
  client: SupabaseClient,
  orgId: string,
  mode: Mode,
): Promise<boolean> {
  const modes = await getEnabledModes(client, orgId)
  return modes.includes(mode)
}

/**
 * Full access check — returns the verdict plus the plan info needed to
 * render an upsell (e.g. "Money mode requires the Growth plan").
 */
export async function checkModeAccess(
  client: SupabaseClient,
  orgId: string,
  mode: Mode,
): Promise<ModeAccess> {
  const currentPlan = await getOrgPlan(client, orgId).catch((err): PlanName => {
    logger.warn('[mode-entitlements] Failed to read org plan:', err)
    return 'free'
  })
  const enabled = MODES_BY_PLAN[currentPlan].includes(mode)
  return {
    allowed: enabled,
    currentPlan,
    requiredPlan: MIN_PLAN_FOR_MODE[mode],
  }
}

/** Convenience: return all modes that are currently locked for the given plan. */
export function getLockedModesForPlan(plan: PlanName): Mode[] {
  const enabled = new Set(MODES_BY_PLAN[plan])
  return ALL_MODES.filter(m => !enabled.has(m))
}

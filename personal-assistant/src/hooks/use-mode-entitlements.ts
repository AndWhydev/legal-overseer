/**
 * use-mode-entitlements.ts — Client hook for per-mode entitlement state.
 *
 * Wraps `GET /api/billing/mode-entitlements` (which itself wraps the
 * `mode-entitlements.ts` primitive from #99) so dashboard surfaces — most
 * importantly the mode switcher — can render locked tabs with a
 * `requiredPlan` hint for the upsell CTA.
 *
 * Lenient by design: while loading or on error, every mode is treated as
 * enabled and no lock state is returned. This means a server-side
 * entitlements outage degrades to "everything visible" rather than locking
 * the user out of their own dashboard. Server-side enforcement (the actual
 * gate) is the security boundary, per the note in `mode-entitlements.ts`.
 *
 * SSR-safe: the initial state mirrors the loading state, so server render
 * and first client render are identical (no hydration warning).
 */

import { useEffect, useState } from 'react'
import type { Mode } from '@/lib/dashboard/mode-store'
import type { PlanName } from '@/lib/billing/plan-gates'

const ENDPOINT = '/api/billing/mode-entitlements'

export interface ModeEntitlementsState {
  /** Current plan tier — null while loading or on error. */
  plan: PlanName | null
  /** Modes the workspace can use right now. Defaults to ALL during loading/error. */
  enabledModes: ReadonlyArray<Mode>
  /** Locked modes with the plan needed to unlock each. Empty during loading/error. */
  lockedModes: Readonly<Partial<Record<Mode, { requiredPlan: PlanName }>>>
  loading: boolean
  error: string | null
}

const ALL_MODES: ReadonlyArray<Mode> = ['chat', 'inbox', 'work', 'money']

const INITIAL_STATE: ModeEntitlementsState = {
  plan: null,
  enabledModes: ALL_MODES,
  lockedModes: {},
  loading: true,
  error: null,
}

interface ApiResponse {
  plan: PlanName
  enabledModes: Mode[]
  lockedModes: Record<string, { requiredPlan: PlanName }>
}

export function useModeEntitlements(): ModeEntitlementsState {
  const [state, setState] = useState<ModeEntitlementsState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function fetchEntitlements() {
      try {
        const res = await fetch(ENDPOINT, { credentials: 'same-origin' })
        if (!res.ok) {
          if (cancelled) return
          // Auth failure or no-org: leave UI permissive, surface error for
          // any consumer that wants to show diagnostics.
          setState({
            ...INITIAL_STATE,
            loading: false,
            error: `entitlements: ${res.status}`,
          })
          return
        }
        const json = (await res.json()) as ApiResponse
        if (cancelled) return
        setState({
          plan: json.plan,
          enabledModes: json.enabledModes,
          lockedModes: json.lockedModes as Record<Mode, { requiredPlan: PlanName }>,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (cancelled) return
        setState({
          ...INITIAL_STATE,
          loading: false,
          error: err instanceof Error ? err.message : 'unknown error',
        })
      }
    }

    fetchEntitlements()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/** Synchronous helper: is a given mode locked according to the supplied state? */
export function isModeLocked(state: ModeEntitlementsState, mode: Mode): boolean {
  return Boolean(state.lockedModes[mode])
}

/**
 * use-mode-onboarding.ts — React hook for per-mode onboarding state.
 *
 * Wraps `mode-onboarding-steps.ts` with localStorage-backed completion state
 * scoped to `(userId, mode)`. The mounting form layer asks the hook
 * "what's the next step?" and reports back via `completeStep(stepId)`.
 *
 * Storage key: `bitbit-onboarding:{userId}:{mode}`
 * Storage value: JSON-encoded array of completed step ids.
 *
 * SSR-safe: returns empty completion state when `window` is undefined, so a
 * server-rendered dashboard never thinks the user is mid-onboarding when in
 * fact they completed it weeks ago. Actual hydration happens in the first
 * client effect.
 *
 * Debounce: 200ms (writes only, reads are immediate). Matches the
 * draft-store cadence so onboarding never loses a click but doesn't thrash
 * localStorage when a user clears the funnel rapidly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getNextStep,
  getOnboardingProgress,
  getStepsForMode,
  isModeOnboardingComplete,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/lib/dashboard/mode-onboarding-steps'
import type { Mode } from '@/lib/dashboard/mode-store'

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'bitbit-onboarding:'
const DEBOUNCE_MS = 200

function buildStorageKey(userId: string, mode: Mode): string {
  return `${STORAGE_KEY_PREFIX}${userId}:${mode}`
}

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readCompletedIds(userId: string, mode: Mode): string[] {
  if (!isStorageAvailable() || !userId) return []
  try {
    const raw = window.localStorage.getItem(buildStorageKey(userId, mode))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Drop anything that isn't a string. Defensive against corrupt entries.
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

function writeCompletedIds(userId: string, mode: Mode, ids: ReadonlyArray<string>): void {
  if (!isStorageAvailable() || !userId) return
  try {
    window.localStorage.setItem(buildStorageKey(userId, mode), JSON.stringify(ids))
  } catch {
    // localStorage may be quota-exceeded or unavailable — silently no-op.
  }
}

function clearCompletedIds(userId: string, mode: Mode): void {
  if (!isStorageAvailable() || !userId) return
  try {
    window.localStorage.removeItem(buildStorageKey(userId, mode))
  } catch {
    // Ignore.
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseModeOnboardingOptions {
  userId: string
  mode: Mode
}

export interface UseModeOnboardingReturn {
  steps: ReadonlyArray<OnboardingStep>
  completedStepIds: ReadonlyArray<string>
  nextStep: OnboardingStep | null
  progress: OnboardingProgress
  isComplete: boolean
  completeStep: (stepId: string) => void
  resetMode: () => void
}

export function useModeOnboarding({ userId, mode }: UseModeOnboardingOptions): UseModeOnboardingReturn {
  // SSR-safe init: server render starts empty, client hydrates in first effect.
  const [completedIds, setCompletedIds] = useState<ReadonlyArray<string>>(() => [])
  const [hydrated, setHydrated] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate on mount and re-hydrate when (userId, mode) changes.
  useEffect(() => {
    if (!userId) return
    setCompletedIds(readCompletedIds(userId, mode))
    setHydrated(true)
  }, [userId, mode])

  // Debounce localStorage writes. Only run after hydration so we don't
  // stomp the persisted value with the empty SSR default.
  //
  // Race note: when (userId, mode) changes, this effect fires once with the
  // stale completedIds (from the previous mode) before the hydration effect
  // re-fires and updates state. The cleanup function clears that pending
  // write before the 200ms timeout elapses, so the stale data never lands —
  // but the cleanup chain is what makes it safe. Don't remove it.
  useEffect(() => {
    if (!hydrated || !userId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      writeCompletedIds(userId, mode, completedIds)
      debounceRef.current = null
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [completedIds, userId, mode, hydrated])

  const steps = useMemo(() => getStepsForMode(mode), [mode])
  const nextStep = useMemo(() => getNextStep(mode, completedIds), [mode, completedIds])
  const progress = useMemo(() => getOnboardingProgress(mode, completedIds), [mode, completedIds])
  const isComplete = useMemo(() => isModeOnboardingComplete(mode, completedIds), [mode, completedIds])

  const completeStep = useCallback((stepId: string) => {
    setCompletedIds(prev => (prev.includes(stepId) ? prev : [...prev, stepId]))
  }, [])

  const resetMode = useCallback(() => {
    setCompletedIds([])
    if (userId) clearCompletedIds(userId, mode)
  }, [userId, mode])

  return {
    steps,
    completedStepIds: completedIds,
    nextStep,
    progress,
    isComplete,
    completeStep,
    resetMode,
  }
}

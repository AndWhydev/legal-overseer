'use client'

import { useState, useEffect } from 'react'

/**
 * Hook that subscribes to the dev seed data toggle.
 * In production, this always returns { active: false, data: null } and
 * the seed-data module is never loaded (tree-shaken).
 */
export function useSeedData() {
  const [state, setState] = useState<{ active: boolean; data: any | null }>({
    active: false,
    data: null,
  })

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    let cleanup: (() => void) | undefined

    // Dynamic import so seed-data.ts is never bundled in production
    import('@/lib/dev/seed-data').then(mod => {
      // Check if already active from a previous toggle
      if (mod.isSeedActive()) {
        setState({ active: true, data: mod.SEED_DATA })
      }

      cleanup = mod.onSeedToggle(payload => {
        setState({ active: payload.active, data: payload.data })
      })
    })

    return () => cleanup?.()
  }, [])

  return state
}

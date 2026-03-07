'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PipelineAnalytics } from '@/lib/leads/types'

export function useLeadsAnalytics() {
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/agent/leads/analytics')
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to load analytics')
      }
      const body = (await response.json()) as { analytics: PipelineAnalytics }
      setAnalytics(body.analytics)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { analytics, isLoading, error, refresh: load }
}

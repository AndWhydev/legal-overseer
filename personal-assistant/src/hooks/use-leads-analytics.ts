'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineAnalytics } from '@/lib/leads/types'

export function useLeadsAnalytics() {
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch('/api/agent/leads/analytics', { signal: controller.signal })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to load analytics')
      }
      const body = (await response.json()) as { analytics: PipelineAnalytics }
      setAnalytics(body.analytics)
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      clearTimeout(timeout)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => { abortRef.current?.abort() }
  }, [load])

  return { analytics, isLoading, error, refresh: load }
}

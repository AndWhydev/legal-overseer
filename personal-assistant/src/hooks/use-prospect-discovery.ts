'use client'

import { useCallback, useState } from 'react'
import type { ProspectResult, DiscoveryJob } from '@/lib/leads/types'
import { useToast } from '@/components/ui/toast'

export function useProspectDiscovery() {
  const { toast } = useToast()
  const [job, setJob] = useState<DiscoveryJob | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const startDiscovery = useCallback(async (businessType: string, location: string, limit = 20) => {
    setIsSearching(true)
    setJob({
      id: crypto.randomUUID(),
      status: 'searching',
      progress: 0,
      message: `Searching for "${businessType}" in ${location}...`,
      results: [],
    })

    try {
      const response = await fetch('/api/agent/leads/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType, location, limit }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Discovery failed')
      }

      const body = (await response.json()) as { results: ProspectResult[] }

      setJob((prev) =>
        prev
          ? { ...prev, status: 'complete', progress: 100, message: `Found ${body.results.length} prospects`, results: body.results }
          : null,
      )

      toast('success', `Found ${body.results.length} prospects`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Discovery failed'
      setJob((prev) =>
        prev ? { ...prev, status: 'error', error: msg, message: msg } : null,
      )
      toast('error', msg)
    } finally {
      setIsSearching(false)
    }
  }, [toast])

  const importProspect = useCallback(async (prospect: ProspectResult) => {
    try {
      const response = await fetch('/api/agent/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Import failed')
      }

      // Mark as imported in results
      setJob((prev) => {
        if (!prev) return null
        return {
          ...prev,
          results: prev.results.map((r) =>
            r.domain === prospect.domain ? { ...r, imported: true } : r,
          ),
        }
      })

      toast('success', `${prospect.name} imported to pipeline`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      toast('error', msg)
    }
  }, [toast])

  const reset = useCallback(() => {
    setJob(null)
    setIsSearching(false)
  }, [])

  return { job, isSearching, startDiscovery, importProspect, reset }
}

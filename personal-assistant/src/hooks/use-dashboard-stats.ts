'use client'

import { useState, useEffect } from 'react'

interface DashboardStats {
  activeTasks: number
  totalRevenue: number
  agentRunsToday: number
  actionsToday?: number
  activeContacts: number
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/stats')
        if (!res.ok) throw new Error('Failed to fetch stats')
        const data = await res.json()
        setStats({
          ...data,
          actionsToday: data.actionsToday ?? data.agentRunsToday,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return { stats, loading, error }
}

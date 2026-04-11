'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  RevenueHealthOverview,
  RevenueRadarSummary,
  ClientRevenueScore,
  CashFlowProjection,
  RevenueScenario,
  RevenueInsight,
  WeeklyDigest,
} from '@/lib/revenue/types'

// ─── Revenue Health ─────────────────────────────────────────────────────────

export function useRevenueHealth() {
  const [data, setData] = useState<RevenueHealthOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/revenue/health')
      if (!res.ok) throw new Error('Failed to fetch revenue health')
      setData(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [])

  return { data, loading, error, refresh }
}

// ─── Revenue Radar ──────────────────────────────────────────────────────────

export function useRevenueRadar() {
  const [data, setData] = useState<RevenueRadarSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRadar() {
      try {
        const res = await fetch('/api/revenue/health?view=radar')
        if (!res.ok) throw new Error('Failed to fetch revenue radar')
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchRadar()
  }, [])

  return { data, loading, error }
}

// ─── Client Scores ──────────────────────────────────────────────────────────

interface ClientScoreWithName extends ClientRevenueScore {
  contact_name: string
}

export function useClientScores(options?: { atRisk?: boolean; limit?: number }) {
  const [clients, setClients] = useState<ClientScoreWithName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchClients() {
      try {
        const params = new URLSearchParams()
        if (options?.atRisk) params.set('at_risk', 'true')
        if (options?.limit) params.set('limit', String(options.limit))

        const res = await fetch(`/api/revenue/clients?${params}`)
        if (!res.ok) throw new Error('Failed to fetch client scores')
        const json = await res.json()
        setClients(json.clients ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchClients()
  }, [options?.atRisk, options?.limit])

  return { clients, loading, error }
}

// ─── Cash Flow ──────────────────────────────────────────────────────────────

export function useCashFlow() {
  const [projections, setProjections] = useState<CashFlowProjection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCashFlow() {
      try {
        const res = await fetch('/api/revenue/cashflow')
        if (!res.ok) throw new Error('Failed to fetch cash flow')
        const json = await res.json()
        setProjections(json.projections ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchCashFlow()
  }, [])

  return { projections, loading, error }
}

// ─── Insights ───────────────────────────────────────────────────────────────

interface InsightWithName extends RevenueInsight {
  contact_name: string | null
}

export function useRevenueInsights(options?: { type?: string; severity?: string }) {
  const [insights, setInsights] = useState<InsightWithName[]>([])
  const [totalAmountCents, setTotalAmountCents] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (options?.type) params.set('type', options.type)
      if (options?.severity) params.set('severity', options.severity)

      const res = await fetch(`/api/revenue/insights?${params}`)
      if (!res.ok) throw new Error('Failed to fetch insights')
      const json = await res.json()
      setInsights(json.insights ?? [])
      setTotalAmountCents(json.total_amount_cents ?? 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [options?.type, options?.severity])

  useEffect(() => { refresh() }, [])

  const updateStatus = useCallback(async (id: string, status: 'acknowledged' | 'actioned' | 'dismissed') => {
    try {
      const res = await fetch('/api/revenue/insights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Failed to update insight')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [refresh])

  return { insights, totalAmountCents, loading, error, refresh, updateStatus }
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

export function useScenarios() {
  const [scenarios, setScenarios] = useState<RevenueScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/revenue/scenarios')
      if (!res.ok) throw new Error('Failed to fetch scenarios')
      const json = await res.json()
      setScenarios(json.scenarios ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [])

  const createScenario = useCallback(async (input: {
    name: string
    description?: string
    scenario_type: string
    parameters: Record<string, unknown>
  }) => {
    try {
      const res = await fetch('/api/revenue/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create scenario')
      const scenario = await res.json()
      await refresh()
      return scenario as RevenueScenario
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    }
  }, [refresh])

  return { scenarios, loading, error, refresh, createScenario }
}

// ─── Weekly Digest ──────────────────────────────────────────────────────────

export function useWeeklyDigest() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDigest() {
      try {
        const res = await fetch('/api/revenue/digest')
        if (!res.ok) throw new Error('Failed to fetch digest')
        setDigest(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchDigest()
  }, [])

  return { digest, loading, error }
}

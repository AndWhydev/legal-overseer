'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  EnhancedLeadData,
  LeadStatus,
  LeadFilter,
  LeadViewMode,
} from '@/lib/leads/types'
import { useToast } from '@/components/ui/toast'

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  booked: 'Booked',
  converted: 'Won',
  lost: 'Lost',
}

const NEXT_STATUS: Record<string, LeadStatus> = {
  new: 'qualified',
  qualified: 'booked',
  booked: 'converted',
}

/** Build query string — only search query goes to server now */
function buildQueryString(_filters: LeadFilter, searchQuery?: string): string {
  const params = new URLSearchParams()
  // All filtering (score, source, smartView, staleness) is done client-side
  if (searchQuery && searchQuery.trim()) params.set('q', searchQuery.trim())
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Server-side key — only search query triggers re-fetch */
function serverFilterKey(_filters: LeadFilter, searchQuery: string): string {
  return searchQuery
}

export function useLeads() {
  const { toast } = useToast()
  const [allLeads, setAllLeads] = useState<EnhancedLeadData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<LeadViewMode>('kanban')
  const [filters, setFilters] = useState<LeadFilter>({ smartView: 'all' })
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Client-side filtering — score, source, smartView all instant, no re-fetch
  const leads = useMemo(() => {
    let result = allLeads

    // Score filter
    const score = filters.score
    if (score && score !== 'all') {
      result = result.filter(l => l.score === score)
    }

    // Source filter
    const source = filters.source
    if (source && source !== 'all') {
      result = result.filter(l => (l.source_channel ?? '').toLowerCase() === source.toLowerCase())
    }

    // Smart view filter
    const sv = filters.smartView ?? 'all'
    if (sv !== 'all') {
      const now = Date.now()
      const oneDayAgo = now - 86_400_000
      const sevenDaysAgo = now - 7 * 86_400_000
      const active = result.filter(l => l.status !== 'converted' && l.status !== 'lost')

      switch (sv) {
        case 'hot_followup':
          result = active.filter(l => l.score === 'hot' && l.last_activity_at && new Date(l.last_activity_at).getTime() < oneDayAgo)
          break
        case 'stale':
          result = active.filter(l => l.last_activity_at && new Date(l.last_activity_at).getTime() < sevenDaysAgo)
          break
        case 'high_value':
          result = active.filter(l => (l.estimated_value ?? 0) > 10000)
          break
      }
    }

    return result
  }, [allLeads, filters.smartView, filters.score, filters.source])

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  // Track server-side filter key to only re-fetch when non-smartView filters change
  const serverKey = serverFilterKey(filters, searchQuery)

  const loadLeads = useCallback(async (f?: LeadFilter, q?: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const qs = buildQueryString(f ?? filters, q ?? searchQuery)
      const response = await fetch(`/api/agent/leads${qs}`, { signal: controller.signal })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to load leads')
      }
      const body = (await response.json()) as { leads?: EnhancedLeadData[] }
      setAllLeads(body.leads ?? [])
    } finally {
      clearTimeout(timeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)

    loadLeads(filters, searchQuery)
      .catch((err) => {
        if (mounted && err instanceof Error && err.name !== 'AbortError') {
          setError(err.message)
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  const moveLead = useCallback(async (leadId: string, newStatus: LeadStatus) => {
    const lead = allLeads.find((l) => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    setMovingLeadId(leadId)
    const previousLeads = allLeads
    setAllLeads((current) => current.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)))

    try {
      const response = await fetch(`/api/agent/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update lead')
      }

      toast('success', `Lead moved to ${STATUS_LABEL[newStatus]}`)
      await loadLeads()
    } catch (err) {
      setAllLeads(previousLeads)
      const msg = err instanceof Error ? err.message : 'Failed to update lead'
      toast('error', msg)
    } finally {
      setMovingLeadId(null)
    }
  }, [allLeads, loadLeads, toast])

  const advanceLead = useCallback(async (leadId: string) => {
    const lead = allLeads.find((l) => l.id === leadId)
    if (!lead) return
    const next = NEXT_STATUS[lead.status]
    if (!next) {
      toast('error', 'Lead is already at a terminal stage')
      return
    }
    return moveLead(leadId, next)
  }, [allLeads, moveLead, toast])

  const updateLead = useCallback(async (leadId: string, patch: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/agent/leads/${encodeURIComponent(leadId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update lead')
      }

      await loadLeads()
      toast('success', 'Lead updated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update lead'
      toast('error', msg)
    }
  }, [loadLeads, toast])

  const grouped = useMemo(() => {
    const byStatus = new Map<LeadStatus, EnhancedLeadData[]>()
    for (const status of ['new', 'qualified', 'booked', 'converted', 'lost'] as LeadStatus[]) {
      byStatus.set(status, leads.filter((l) => l.status === status))
    }
    return byStatus
  }, [leads])

  return {
    leads,
    allLeads,
    grouped,
    isLoading,
    error,
    selectedLead,
    selectedLeadId,
    setSelectedLeadId,
    viewMode,
    setViewMode,
    filters,
    setFilters,
    moveLead,
    advanceLead,
    updateLead,
    movingLeadId,
    searchQuery,
    setSearchQuery,
    refresh: () => {
      setError(null)
      setIsLoading(true)
      loadLeads(filters, searchQuery)
        .catch((err) => {
          if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
        })
        .finally(() => setIsLoading(false))
    },
  }
}

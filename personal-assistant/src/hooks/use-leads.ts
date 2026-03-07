'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  EnhancedLeadData,
  LeadStatus,
  LeadFilter,
  SmartView,
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

function buildQueryString(filters: LeadFilter): string {
  const params = new URLSearchParams()
  if (filters.score && filters.score !== 'all') params.set('score', filters.score)
  if (filters.source && filters.source !== 'all') params.set('source', filters.source)
  if (filters.staleness && filters.staleness !== 'all') params.set('stale_days', filters.staleness)
  if (filters.minValue != null) params.set('min_value', String(filters.minValue))
  if (filters.maxValue != null) params.set('max_value', String(filters.maxValue))
  if (filters.smartView && filters.smartView !== 'all') params.set('smart_view', filters.smartView)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function useLeads() {
  const { toast } = useToast()
  const [leads, setLeads] = useState<EnhancedLeadData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<LeadViewMode>('kanban')
  const [filters, setFilters] = useState<LeadFilter>({ smartView: 'all' })
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null)

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  const loadLeads = useCallback(async (f?: LeadFilter) => {
    const qs = buildQueryString(f ?? filters)
    const response = await fetch(`/api/agent/leads${qs}`)
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Failed to load leads')
    }
    const body = (await response.json()) as { leads?: EnhancedLeadData[] }
    setLeads(body.leads ?? [])
  }, [filters])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)

    loadLeads(filters)
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load leads')
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => { mounted = false }
  }, [loadLeads, filters])

  const moveLead = useCallback(async (leadId: string, newStatus: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    setMovingLeadId(leadId)
    const previousLeads = leads
    setLeads((current) => current.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)))

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
      setLeads(previousLeads)
      const msg = err instanceof Error ? err.message : 'Failed to update lead'
      toast('error', msg)
    } finally {
      setMovingLeadId(null)
    }
  }, [leads, loadLeads, toast])

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
    updateLead,
    movingLeadId,
    refresh: () => loadLeads(),
  }
}

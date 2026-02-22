'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type LeadStatus = 'new' | 'qualified' | 'booked' | 'converted' | 'lost'
type LeadScore = 'hot' | 'warm' | 'cold'

interface LeadCardData {
  id: string
  status: LeadStatus
  score: LeadScore
  notes: string | null
  estimated_value: number | null
  timeline_days: number | null
  service_interest: string[] | null
  source_channel: string
  source_detail: string | null
  metadata: Record<string, unknown> | null
}

const BOARD_COLUMNS: Array<{
  id: 'new' | 'qualified' | 'booked' | 'won_lost'
  label: string
  statuses: LeadStatus[]
}> = [
  { id: 'new', label: 'New', statuses: ['new'] },
  { id: 'qualified', label: 'Qualified', statuses: ['qualified'] },
  { id: 'booked', label: 'Booked', statuses: ['booked'] },
  { id: 'won_lost', label: 'Won / Lost', statuses: ['converted', 'lost'] },
]

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  booked: 'Booked',
  converted: 'Won',
  lost: 'Lost',
}

const SCORE_STYLES: Record<LeadScore, string> = {
  hot: 'border-red-500/30 bg-red-500/10 text-red-300',
  warm: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  cold: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

function formatCurrency(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown value'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function moveOptionsFor(status: LeadStatus): LeadStatus[] {
  if (status === 'new') return ['qualified', 'booked', 'lost']
  if (status === 'qualified') return ['booked', 'converted', 'lost']
  if (status === 'booked') return ['converted', 'lost', 'qualified']
  return []
}

export function LeadsKanban() {
  const [leads, setLeads] = useState<LeadCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    const response = await fetch('/api/agent/leads')
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? 'Failed to load leads')
    }

    const body = (await response.json()) as { leads?: LeadCardData[] }
    setLeads(body.leads ?? [])
  }, [])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        await loadLeads()
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load leads')
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [loadLeads])

  async function refreshAfterMutation(success: string) {
    setIsRefreshing(true)
    try {
      await loadLeads()
      setStatusMessage(success)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh leads')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function moveLead(lead: LeadCardData, nextStatus: LeadStatus) {
    if (lead.status === nextStatus) return

    setMovingLeadId(lead.id)
    setStatusMessage(null)
    setErrorMessage(null)

    const previousLeads = leads
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status: nextStatus } : item)))

    try {
      const response = await fetch(`/api/agent/leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update lead stage')
      }

      await refreshAfterMutation(`Lead moved to ${STATUS_LABEL[nextStatus]}.`)
    } catch (error) {
      setLeads(previousLeads)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update lead stage')
    } finally {
      setMovingLeadId(null)
    }
  }

  const grouped = useMemo(() => {
    const byStatus = new Map<LeadStatus, LeadCardData[]>()
    for (const status of ['new', 'qualified', 'booked', 'converted', 'lost'] as LeadStatus[]) {
      byStatus.set(status, leads.filter((lead) => lead.status === status))
    }
    return byStatus
  }, [leads])

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading lead pipeline...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {statusMessage ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-500">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => {
          const leadsInColumn = column.statuses.flatMap((status) => grouped.get(status) ?? [])

          return (
            <section key={column.id} className="flex min-h-[420px] flex-col rounded-xl border border-border bg-card p-4">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">{column.label}</h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {leadsInColumn.length}
                </span>
              </header>

              <div className="flex flex-1 flex-col gap-3">
                {leadsInColumn.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
                    No leads in this stage.
                  </div>
                ) : (
                  leadsInColumn.map((lead) => {
                    const moves = moveOptionsFor(lead.status)

                    return (
                      <article key={lead.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">{lead.source_channel}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SCORE_STYLES[lead.score]}`}>
                            {lead.score}
                          </span>
                        </div>

                        <p className="text-sm font-medium text-foreground">
                          {lead.source_detail || `Lead ${lead.id.slice(0, 8)}`}
                        </p>

                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>Value: {formatCurrency(lead.estimated_value)}</p>
                          <p>
                            Timeline:{' '}
                            {typeof lead.timeline_days === 'number' ? `${lead.timeline_days} days` : 'Unknown'}
                          </p>
                          {Array.isArray(lead.service_interest) && lead.service_interest.length > 0 ? (
                            <p>Services: {lead.service_interest.join(', ')}</p>
                          ) : null}
                          {lead.notes ? <p className="line-clamp-2">Notes: {lead.notes}</p> : null}
                        </div>

                        {moves.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {moves.map((nextStatus) => (
                              <button
                                key={`${lead.id}-${nextStatus}`}
                                type="button"
                                disabled={movingLeadId === lead.id || isRefreshing}
                                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void moveLead(lead, nextStatus)}
                              >
                                Move to {STATUS_LABEL[nextStatus]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground">
                            Finalized: {STATUS_LABEL[lead.status]}
                          </div>
                        )}
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'

interface ProposalCardData {
  id: string
  title: string
  project_type: string
  status: ProposalStatus
  pricing: string | null
  timeline: string | null
  client_contact_id: string | null
  created_at: string
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  metadata: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Board config
// ---------------------------------------------------------------------------

const BOARD_COLUMNS: Array<{
  id: string
  label: string
  statuses: ProposalStatus[]
}> = [
  { id: 'draft', label: 'Draft', statuses: ['draft'] },
  { id: 'sent', label: 'Sent', statuses: ['sent'] },
  { id: 'viewed', label: 'Viewed', statuses: ['viewed'] },
  { id: 'outcome', label: 'Accepted / Declined', statuses: ['accepted', 'declined'] },
]

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
  sent: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  viewed: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  accepted: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  declined: 'border-red-500/30 bg-red-500/10 text-red-300',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
}

function parsePricingTotal(pricing: string | null): number | null {
  if (!pricing) return null
  try {
    const tiers = JSON.parse(pricing) as Array<{ tier: string; price: number }>
    // Show the standard tier price, or the first one
    const standard = tiers.find((t) => t.tier === 'Standard') || tiers[0]
    return standard?.price ?? null
  } catch {
    return null
  }
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function moveOptionsFor(status: ProposalStatus): ProposalStatus[] {
  if (status === 'draft') return ['sent']
  if (status === 'sent') return ['viewed', 'accepted', 'declined']
  if (status === 'viewed') return ['accepted', 'declined']
  return []
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProposalsKanban() {
  const [proposals, setProposals] = useState<ProposalCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch('/api/proposals')
      if (!res.ok) return
      const data = await res.json()
      setProposals(data.proposals ?? data ?? [])
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  const moveProposal = useCallback(
    async (id: string, newStatus: ProposalStatus) => {
      setMovingId(id)
      try {
        const res = await fetch('/api/proposals/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: newStatus }),
        })
        if (res.ok) {
          setProposals((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)),
          )
        }
      } catch {
        // silent
      } finally {
        setMovingId(null)
      }
    },
    [],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, ProposalCardData[]>()
    for (const col of BOARD_COLUMNS) {
      map.set(col.id, [])
    }
    for (const p of proposals) {
      const col = BOARD_COLUMNS.find((c) => c.statuses.includes(p.status))
      if (col) {
        map.get(col.id)!.push(p)
      }
    }
    return map
  }, [proposals])

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {BOARD_COLUMNS.map((col) => (
          <div key={col.id} className="rounded-xl bg-card/50 p-4 animate-pulse">
            <div className="h-5 w-24 rounded bg-muted mb-4" />
            <div className="space-y-3">
              <div className="h-24 rounded-lg bg-muted" />
              <div className="h-24 rounded-lg bg-muted" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((col) => {
        const items = grouped.get(col.id) || []
        return (
          <div key={col.id} className="rounded-xl bg-card/50 border border-border/50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {col.label}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {items.length}
              </span>
            </div>

            <div className="space-y-3">
              {items.map((p) => {
                const total = parsePricingTotal(p.pricing)
                const options = moveOptionsFor(p.status)
                const isMoving = movingId === p.id

                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-3 transition-colors ${STATUS_COLORS[p.status]} ${isMoving ? 'opacity-50' : ''}`}
                  >
                    <p className="text-sm font-medium leading-tight mb-1 line-clamp-2">
                      {p.title}
                    </p>

                    <div className="flex items-center gap-2 text-xs opacity-75 mb-2">
                      <span>{p.project_type.replace(/_/g, ' ')}</span>
                      {p.timeline && (
                        <>
                          <span className="opacity-40">|</span>
                          <span>{p.timeline}</span>
                        </>
                      )}
                    </div>

                    {total !== null && (
                      <p className="text-sm font-semibold mb-2">{formatCurrency(total)}</p>
                    )}

                    <p className="text-xs opacity-60">{relativeTime(p.created_at)}</p>

                    {options.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {options.map((opt) => (
                          <button
                            key={opt}
                            className="rounded px-2 py-0.5 text-xs bg-white/10 hover:bg-white/20 transition-colors"
                            onClick={() => moveProposal(p.id, opt)}
                            disabled={isMoving}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {items.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6 opacity-50">
                  No proposals
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab wrapper
// ---------------------------------------------------------------------------

function ProposalsTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Track proposals across Draft, Sent, Viewed, and Accepted/Declined
          </p>
        </div>
      </div>

      <ProposalsKanban />
    </div>
  )
}

export default React.memo(ProposalsTab)

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { TabShell } from '@/components/ui/tab-shell'
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TabSkeleton } from '@/components/dashboard/tabs/tab-skeleton'

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

// Tailwind classes per status — border, bg, text
const STATUS_CARD_CLASSES: Record<ProposalStatus, string> = {
  draft:    'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  sent:     'border-blue-500/30 bg-blue-500/10 text-blue-300',
  viewed:   'border-amber-500/30 bg-amber-500/10 text-amber-300',
  accepted: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  declined: 'border-red-500/30 bg-red-500/10 text-red-300',
}

const STATUS_BADGE_CLASSES: Record<ProposalStatus, string> = {
  draft:    'border-zinc-500/40 bg-zinc-500/15 text-zinc-400',
  sent:     'border-blue-500/40 bg-blue-500/15 text-blue-300',
  viewed:   'border-amber-500/40 bg-amber-500/15 text-amber-300',
  accepted: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  declined: 'border-red-500/40 bg-red-500/15 text-red-300',
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
      const res = await fetch('/api/agent/proposals')
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
        const res = await fetch('/api/agent/proposals/status', {
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
    return <TabSkeleton variant="kanban" />
  }

  if (proposals.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No proposals yet</EmptyTitle>
        <EmptyDescription>Proposals generated from meeting transcripts will show up here</EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {BOARD_COLUMNS.map((col) => {
        const items = grouped.get(col.id) || []
        return (
          <div key={col.id} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {col.label}
              </h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {items.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {items.map((p) => {
                const total = parsePricingTotal(p.pricing)
                const options = moveOptionsFor(p.status)
                const isMoving = movingId === p.id

                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-3 transition-colors ${STATUS_CARD_CLASSES[p.status]} ${isMoving ? 'opacity-50' : ''}`}
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
                          <Badge
                            key={opt}
                            variant="outline"
                            className={`cursor-pointer transition-opacity hover:opacity-80 ${STATUS_BADGE_CLASSES[opt]}`}
                            onClick={() => !isMoving && moveProposal(p.id, opt)}
                            aria-disabled={isMoving}
                          >
                            {opt}
                          </Badge>
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
    <TabShell>
      <ProposalsKanban />
    </TabShell>
  )
}

export default React.memo(ProposalsTab)

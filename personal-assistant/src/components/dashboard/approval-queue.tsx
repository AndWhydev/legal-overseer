'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { IconAlertCircle, IconRefresh, IconLoader2, IconShieldCheck } from '@tabler/icons-react'
import { ApprovalCard, type ApprovalItem } from './approval-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'

type FilterKey = 'all' | 'urgent' | 'normal'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'normal', label: 'Normal' },
]

interface ApprovalsResponse {
  approvals?: ApprovalItem[]
  error?: string
}

export function ApprovalQueue() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchApprovals = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await fetch('/api/agent/approvals', {
        method: 'GET',
        cache: 'no-store',
      })
      const payload = (await response.json()) as ApprovalsResponse

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load pending approvals')
      }

      setApprovals(payload.approvals ?? [])
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pending approvals'
      setError(message)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchApprovals()

    const refreshTimer = window.setInterval(() => {
      fetchApprovals(true)
    }, 30_000)

    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [fetchApprovals])

  const visibleApprovals = useMemo(() => {
    if (activeFilter === 'all') {
      return approvals
    }
    return approvals.filter((approval) => approval.priority === activeFilter)
  }, [activeFilter, approvals])

  const resolveApproval = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected') => {
      const target = approvals.find((approval) => approval.id === approvalId)
      if (!target) {
        return
      }

      setResolvingId(approvalId)
      setError(null)
      setApprovals((prev) => prev.filter((approval) => approval.id !== approvalId))

      try {
        const response = await fetch('/api/agent/approvals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId, decision }),
        })

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string }
          throw new Error(payload.error ?? `Failed to ${decision === 'approved' ? 'approve' : 'reject'} action`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to resolve approval'
        setError(message)
        setApprovals((prev) => [target, ...prev])
      } finally {
        setResolvingId(null)
      }
    },
    [approvals],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-medium tracking-tight text-foreground">Pending Actions</h2>
          <Badge variant="secondary">{approvals.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={filter.key}
              variant={activeFilter === filter.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="w-fit" onClick={() => fetchApprovals()}>
            <IconRefresh className="size-4" />
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          Loading pending approvals...
        </div>
      )}

      {/* Empty */}
      {!loading && visibleApprovals.length === 0 && (
        <Empty>
          <EmptyMedia><IconShieldCheck size={24} /></EmptyMedia>
          <EmptyTitle>Nothing needs approval</EmptyTitle>
          <EmptyDescription>When BitBit wants to send an email, create an invoice, or take action on your behalf, it asks here first.</EmptyDescription>
        </Empty>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {visibleApprovals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            isResolving={resolvingId === approval.id}
            onApprove={(approvalId) => resolveApproval(approvalId, 'approved')}
            onReject={(approvalId) => resolveApproval(approvalId, 'rejected')}
          />
        ))}
      </div>
    </div>
  )
}

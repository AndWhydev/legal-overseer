'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  IconBell,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconBulb,
  IconShieldCheck,
} from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RoleType } from '@/lib/bitbit-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttentionItem {
  id: string
  source: 'approval' | 'escalation' | 'insight'
  source_id: string
  role_type: string | null
  priority: number
  summary: string
  details: Record<string, unknown>
  action_type: string | null
  created_at: string
}

interface AttentionViewProps {
  maxHeight?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_META: Record<string, { icon: React.ElementType; colorClass: string; label: string }> = {
  approval: { icon: IconShieldCheck, colorClass: 'text-foreground bg-muted', label: 'Approval needed' },
  escalation: { icon: IconAlertTriangle, colorClass: 'text-amber-500 bg-amber-500/10', label: 'Escalation' },
  insight: { icon: IconBulb, colorClass: 'text-blue-500 bg-blue-500/10', label: 'Needs review' },
}

const ROLE_LABELS: Record<string, string> = {
  finance: 'Finance',
  comms: 'Comms',
  sales: 'Sales',
}

const ROLE_COLORS: Record<string, string> = {
  finance: 'text-emerald-500 bg-emerald-500/10',
  comms: 'text-blue-500 bg-blue-500/10',
  sales: 'text-foreground bg-muted',
}

const PRIORITY_COLORS: Record<number, { label: string; className: string }> = {
  0: { label: 'Urgent', className: 'bg-destructive' },
  1: { label: 'High', className: 'bg-amber-500' },
  2: { label: 'Medium', className: 'bg-muted-foreground' },
  3: { label: 'Low', className: 'bg-muted-foreground/50' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttentionView({ maxHeight = 'calc(100vh - 300px)' }: AttentionViewProps) {
  const [items, setItems] = useState<AttentionItem[]>([])
  const [counts, setCounts] = useState({ approvals: 0, escalations: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const fetchAttention = useCallback(async () => {
    try {
      const res = await fetch('/api/roles/attention')
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setCounts(data.counts ?? { approvals: 0, escalations: 0, total: 0 })
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAttention()
    const interval = setInterval(fetchAttention, 15000)
    return () => clearInterval(interval)
  }, [fetchAttention])

  const handleApproval = useCallback(async (sourceId: string, decision: 'approved' | 'rejected') => {
    setResolvingId(sourceId)
    try {
      const res = await fetch('/api/agent/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId: sourceId, decision }),
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.source_id !== sourceId))
        setCounts(prev => ({ ...prev, approvals: prev.approvals - 1, total: prev.total - 1 }))
      }
    } catch {
      // Silently fail
    } finally {
      setResolvingId(null)
    }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBell size={14} className="text-foreground" />
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Needs Your Attention
            </CardTitle>
            {counts.total > 0 && (
              <Badge>{counts.total}</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-y-auto flex flex-col gap-2" style={{ maxHeight }}>
          {loading ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-3/5 mb-2" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <IconCircleCheck size={28} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">
                No items need your attention right now
              </p>
            </div>
          ) : (
            items.map(item => {
              const sourceMeta = SOURCE_META[item.source] ?? SOURCE_META.insight
              const Icon = sourceMeta.icon
              const priorityMeta = PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS[2]
              const isHovered = hoveredId === item.id
              const isResolving = resolvingId === item.source_id

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isResolving ? 'opacity-50' : ''
                  } ${isHovered ? 'bg-muted/50' : ''}`}
                >
                  {/* Priority indicator */}
                  <div className={`w-0.5 self-stretch rounded-full shrink-0 ${priorityMeta.className}`} />

                  {/* Icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${sourceMeta.colorClass}`}>
                    <Icon size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {item.summary}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className={sourceMeta.colorClass}>
                        {sourceMeta.label}
                      </Badge>
                      {item.role_type && (
                        <Badge variant="secondary" className={ROLE_COLORS[item.role_type] ?? ''}>
                          {ROLE_LABELS[item.role_type] ?? item.role_type}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    {/* Action buttons for approvals */}
                    {item.source === 'approval' && isHovered && !isResolving && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="xs"
                          variant="outline"
                          className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={(e) => { e.stopPropagation(); handleApproval(item.source_id, 'approved') }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleApproval(item.source_id, 'rejected') }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  IconActivity,
  IconAlertCircle,
  IconBolt,
  IconAlertTriangle,
  IconBrain,
  IconCircleX,
  IconSitemap,
  IconBulb,
  IconFilter,
} from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import type { RoleType, ActivityType } from '@/lib/bitbit-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string
  role_config_id: string
  role_type: RoleType | null
  activity_type: ActivityType
  summary: string
  details: Record<string, unknown>
  confidence?: number
  autonomy_mode?: string
  reasoning?: string
  reversible?: boolean
  created_at: string
}

interface RoleActivityFeedProps {
  maxHeight?: string
  limit?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  action: IconBolt,
  insight: IconBulb,
  escalation: IconAlertTriangle,
  learning: IconBrain,
  error: IconCircleX,
  workflow_step: IconSitemap,
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  action: 'text-foreground bg-muted',
  insight: 'text-blue-500 bg-blue-500/10',
  escalation: 'text-amber-500 bg-amber-500/10',
  learning: 'text-violet-500 bg-violet-500/10',
  error: 'text-destructive bg-destructive/10',
  workflow_step: 'text-muted-foreground bg-muted',
}

const ROLE_LABELS: Record<RoleType, string> = {
  finance: 'Finance',
  comms: 'Comms',
  sales: 'Sales',
  growth: 'Growth',
}

const ROLE_BADGE_COLORS: Record<RoleType, string> = {
  finance: 'text-emerald-500 bg-emerald-500/10',
  comms: 'text-blue-500 bg-blue-500/10',
  sales: 'text-foreground bg-muted',
  growth: 'text-foreground bg-muted',
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

export function RoleActivityFeed({ maxHeight = 'calc(100vh - 300px)', limit = 50 }: RoleActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleType | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')

  const fetchActivity = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) })
      if (roleFilter !== 'all') params.set('role_type', roleFilter)
      if (typeFilter !== 'all') params.set('types', typeFilter)

      const res = await fetch(`/api/roles/activity?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setActivities(data.activities ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [limit, roleFilter, typeFilter])

  useEffect(() => {
    fetchActivity()
    const interval = setInterval(fetchActivity, 30000)
    return () => clearInterval(interval)
  }, [fetchActivity])

  const sortedActivities = useMemo(() => {
    const priority: Record<ActivityType, number> = {
      escalation: 0,
      error: 1,
      action: 2,
      insight: 3,
      learning: 4,
      workflow_step: 5,
    }
    return [...activities].sort((a, b) => {
      const pa = priority[a.activity_type] ?? 99
      const pb = priority[b.activity_type] ?? 99
      if (pa !== pb) return pa - pb
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [activities])

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconActivity size={14} className="text-foreground" />
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Role Activity</CardTitle>
          </div>
          <IconFilter size={12} className="text-muted-foreground" />
        </div>
      </CardHeader>

      <CardContent>
        {/* Filter pills */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'finance', 'comms', 'sales'] as const).map(role => (
            <Button
              key={role}
              variant={roleFilter === role ? 'secondary' : 'ghost'}
              size="xs"
              className={`rounded-full ${roleFilter !== role ? 'text-muted-foreground' : ''}`}
              onClick={() => setRoleFilter(role)}
            >
              {role === 'all' ? 'All Roles' : ROLE_LABELS[role]}
            </Button>
          ))}
          <div className="w-px bg-border mx-1" />
          {(['all', 'escalation', 'action', 'insight', 'error'] as const).map(type => (
            <Button
              key={type}
              variant={typeFilter === type ? 'secondary' : 'ghost'}
              size="xs"
              className={`rounded-full ${typeFilter !== type ? 'text-muted-foreground' : ''}`}
              onClick={() => setTypeFilter(type)}
            >
              {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
            </Button>
          ))}
        </div>

        {/* Activity list */}
        <div className="overflow-y-auto flex flex-col gap-2" style={{ maxHeight }}>
          {loading ? (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-3/4 mb-2" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
              </div>
            ))
          ) : error ? (
            <Empty className="py-10">
              <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
              <EmptyTitle>{"Couldn't load activity"}</EmptyTitle>
              <EmptyDescription>Could not load role activity. Please try again.</EmptyDescription>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => fetchActivity()}>Retry</Button>
              </EmptyContent>
            </Empty>
          ) : sortedActivities.length === 0 ? (
            <Empty className="py-10">
              <EmptyMedia variant="icon"><IconActivity size={20} /></EmptyMedia>
              <EmptyTitle>No role activity yet</EmptyTitle>
              <EmptyDescription>Activity will appear as roles process work</EmptyDescription>
            </Empty>
          ) : (
            sortedActivities.map(item => {
              const Icon = ACTIVITY_ICONS[item.activity_type] ?? IconActivity
              const colorClass = ACTIVITY_COLORS[item.activity_type] ?? 'text-muted-foreground bg-muted'

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground leading-snug">
                      {item.summary}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.role_type && (
                        <Badge variant="secondary" className={ROLE_BADGE_COLORS[item.role_type]}>
                          {ROLE_LABELS[item.role_type]}
                        </Badge>
                      )}
                      {item.confidence != null && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {Math.round(item.confidence * 100)}%
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>
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

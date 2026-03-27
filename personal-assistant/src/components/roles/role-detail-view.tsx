'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  IconArrowLeft,
  IconCurrencyDollar,
  IconMessage,
  IconTrendingUp,
  IconActivity,
  IconBolt,
  IconBulb,
  IconAlertTriangle,
  IconBrain,
  IconCircleX,
  IconGitBranch,
  IconClock,
  IconSettings,
} from '@tabler/icons-react'
import type { RoleType, ActivityType, AutonomyLevel } from '@/lib/bitbit-core'
import { AutonomyToggle } from './autonomy-toggle'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleDetailViewProps {
  roleType: RoleType
  onBack: () => void
}

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

interface RoleStatus {
  role_config_id: string
  role_type: RoleType
  enabled: boolean
  autonomy_level: AutonomyLevel
  last_tick_at: string | null
  next_tick_at: string | null
  active_workflows: number
  activity_24h: {
    actions: number
    insights: number
    escalations: number
    errors: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_META: Record<RoleType, { label: string; icon: React.ElementType; color: string }> = {
  finance: { label: 'Finance', icon: IconCurrencyDollar, color: '#22c55e' },
  comms: { label: 'Communications', icon: IconMessage, color: '#3b82f6' },
  sales: { label: 'Sales', icon: IconTrendingUp, color: '#F1F5F9' },
  growth: { label: 'Growth', icon: IconTrendingUp, color: '#f59e0b' },
}

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  action: IconBolt,
  insight: IconBulb,
  escalation: IconAlertTriangle,
  learning: IconBrain,
  error: IconCircleX,
  workflow_step: IconGitBranch,
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  action: '#F1F5F9',
  insight: '#3b82f6',
  escalation: '#eab308',
  learning: '#8b5cf6',
  error: '#ef4444',
  workflow_step: '#94A3B8',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
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

export function RoleDetailView({ roleType, onBack }: RoleDetailViewProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [status, setStatus] = useState<RoleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const meta = ROLE_META[roleType]
  const RoleIcon = meta.icon

  const fetchData = useCallback(async () => {
    try {
      const [actRes, statusRes] = await Promise.all([
        fetch(`/api/roles/activity?role_type=${roleType}&limit=100`),
        fetch('/api/roles/status'),
      ])

      if (actRes.ok) {
        const actData = await actRes.json()
        setActivities(actData.activities ?? [])
      }
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        const roleStatus = (statusData.roles ?? []).find((r: RoleStatus) => r.role_type === roleType)
        setStatus(roleStatus ?? null)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [roleType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="flex flex-col gap-4">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 rounded-xl border border-border bg-transparent text-foreground cursor-pointer transition-all hover:bg-accent"
        >
          <IconArrowLeft size={16} />
        </button>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${meta.color}15` }}
        >
          <RoleIcon size={18} style={{ color: meta.color }} />
        </div>
        <div>
          <div className="text-base font-medium text-foreground tracking-tight">
            {meta.label} Role
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            Full activity history and configuration
          </div>
        </div>
      </div>

      {/* Status + Autonomy row */}
      {status && (
        <div className="grid grid-cols-2 gap-3">
          {/* Status card */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-lg p-5 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Status</div>
            <div className="grid grid-cols-2 gap-3">
              <StatCell label="Last tick" value={timeAgo(status.last_tick_at)} />
              <StatCell label="Active workflows" value={String(status.active_workflows)} mono />
              <StatCell label="Actions (24h)" value={String(status.activity_24h.actions)} mono />
              <StatCell label="Insights (24h)" value={String(status.activity_24h.insights)} mono />
              <StatCell label="Escalations (24h)" value={String(status.activity_24h.escalations)} mono />
              <StatCell label="Errors (24h)" value={String(status.activity_24h.errors)} mono />
            </div>
          </div>

          {/* Autonomy card */}
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-lg p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              <IconSettings size={11} />
              Autonomy Level
            </div>
            <AutonomyToggle
              roleType={roleType}
              currentLevel={status.autonomy_level}
              enabled={status.enabled}
              onLevelChange={() => fetchData()}
            />
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <IconActivity size={14} style={{ color: meta.color }} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Activity Timeline</span>
          <span className="text-sm text-muted-foreground ml-auto">
            {activities.length} events
          </span>
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-450px)] flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 opacity-50">
                <div className="h-6 w-6 rounded-lg bg-muted" />
                <div className="flex-1">
                  <div className="h-3 rounded bg-muted w-3/5 mb-2" />
                  <div className="h-2.5 rounded bg-muted/50 w-2/5" />
                </div>
              </div>
            ))
          ) : activities.length === 0 ? (
            <div className="py-10 text-center">
              <IconActivity size={28} className="text-muted-foreground mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">No activity yet</div>
            </div>
          ) : (
            activities.map(item => {
              const ItemIcon = ACTIVITY_ICONS[item.activity_type] ?? IconActivity
              const color = ACTIVITY_COLORS[item.activity_type] ?? '#94A3B8'
              const isHovered = hoveredId === item.id
              const isExpanded = expandedId === item.id

              return (
                <div key={item.id}>
                  <div
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      isHovered ? 'bg-accent' : 'bg-muted/30'
                    }`}
                  >
                    {/* Timeline dot */}
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${color}15` }}
                    >
                      <ItemIcon size={12} style={{ color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground leading-relaxed">
                        {item.summary}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded capitalize"
                          style={{ background: `${color}15`, color }}
                        >
                          {item.activity_type.replace('_', ' ')}
                        </span>
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

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-0.5 ml-9 p-3 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground leading-relaxed">
                      {item.reasoning && (
                        <div className="mb-2">
                          <span className="font-medium text-foreground">Reasoning: </span>
                          {item.reasoning}
                        </div>
                      )}
                      {item.autonomy_mode && (
                        <div className="mb-1">
                          <span className="font-medium">Mode:</span> {item.autonomy_mode}
                        </div>
                      )}
                      {item.reversible != null && (
                        <div className="mb-1">
                          <span className="font-medium">Reversible:</span> {item.reversible ? 'Yes' : 'No'}
                        </div>
                      )}
                      {Object.keys(item.details).length > 0 && (
                        <div>
                          <span className="font-medium">Details:</span>
                          <pre className="mt-1 p-2 rounded-lg bg-muted/50 text-xs font-mono text-muted-foreground overflow-auto max-h-[200px] whitespace-pre-wrap break-words">
                            {JSON.stringify(item.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponent
// ---------------------------------------------------------------------------

function StatCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  )
}

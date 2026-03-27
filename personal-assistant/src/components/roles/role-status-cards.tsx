'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  IconCurrencyDollar,
  IconMessageCircle,
  IconTrendingUp,
  IconClock,
  IconSitemap,
  IconPower,
  IconAlertCircle,
  IconBolt,
  IconBulb,
} from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RoleType, AutonomyLevel } from '@/lib/bitbit-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleStatus {
  role_config_id: string
  role_type: RoleType
  enabled: boolean
  autonomy_level: AutonomyLevel
  tick_interval_seconds: number
  daily_budget_cents: number
  last_tick_at: string | null
  next_tick_at: string | null
  state_version: number
  active_workflows: number
  activity_24h: {
    actions: number
    insights: number
    escalations: number
    errors: number
  }
  updated_at: string
}

interface RoleStatusCardsProps {
  onRoleClick?: (roleType: RoleType) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_META: Record<RoleType, { label: string; icon: React.ElementType; colorClass: string; description: string }> = {
  finance: { label: 'Finance', icon: IconCurrencyDollar, colorClass: 'text-emerald-500 bg-emerald-500/10', description: 'Invoices, payments, cash flow' },
  comms: { label: 'Communications', icon: IconMessageCircle, colorClass: 'text-blue-500 bg-blue-500/10', description: 'Email triage, responses, follow-ups' },
  sales: { label: 'Sales', icon: IconTrendingUp, colorClass: 'text-foreground bg-muted', description: 'Leads, proposals, pipeline' },
  growth: { label: 'Growth', icon: IconTrendingUp, colorClass: 'text-amber-500 bg-amber-500/10', description: 'SEO monitoring, tender hunting' },
}

const AUTONOMY_LABELS: Record<AutonomyLevel, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  observer: { label: 'Observer', variant: 'outline' },
  copilot: { label: 'Co-pilot', variant: 'secondary' },
  autopilot: { label: 'Autopilot', variant: 'default' },
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleStatusCards({ onRoleClick }: RoleStatusCardsProps) {
  const [roles, setRoles] = useState<RoleStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/roles/status')
      if (!res.ok) return
      const data = await res.json()
      setRoles(data.roles ?? [])
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  const enableRole = useCallback(async (roleType: RoleType) => {
    setEnabling(roleType)
    try {
      const res = await fetch(`/api/roles/${roleType}/enable`, { method: 'POST' })
      if (res.ok) await fetchStatus()
    } finally {
      setEnabling(null)
    }
  }, [fetchStatus])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const allRoleTypes: RoleType[] = ['finance', 'comms', 'sales']
  const roleMap = new Map(roles.map(r => [r.role_type, r]))

  if (loading) {
    return (
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Role Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allRoleTypes.map(rt => (
            <Card key={rt} className="py-5 opacity-50">
              <CardContent>
                <Skeleton className="h-4 w-2/5 mb-3" />
                <Skeleton className="h-8 w-3/5 mb-2" />
                <Skeleton className="h-3 w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Role Status</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {allRoleTypes.map(rt => {
          const status = roleMap.get(rt)
          const meta = ROLE_META[rt]
          const Icon = meta.icon
          const isConfigured = !!status
          const autonomy = status ? AUTONOMY_LABELS[status.autonomy_level] : null

          return (
            <Card
              key={rt}
              className="py-5 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onRoleClick?.(rt)}
            >
              <CardContent>
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.colorClass}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{meta.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{meta.description}</div>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    isConfigured && status.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-muted-foreground/40'
                  }`} />
                </div>

                {!isConfigured ? (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-muted-foreground">Not configured</span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); enableRole(rt) }}
                      disabled={enabling === rt}
                      className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                    >
                      <IconPower size={12} />
                      {enabling === rt ? 'Enabling...' : 'Enable'}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Autonomy + State */}
                    <div className="flex items-center gap-2 mb-3">
                      {autonomy && (
                        <Badge variant={autonomy.variant}>{autonomy.label}</Badge>
                      )}
                      {!status.enabled && (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </div>

                    {/* Metrics row */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border">
                      <MetricCell icon={<IconBolt size={11} />} label="Actions" value={status.activity_24h.actions} />
                      <MetricCell icon={<IconBulb size={11} />} label="Insights" value={status.activity_24h.insights} />
                      <MetricCell icon={<IconSitemap size={11} />} label="Workflows" value={status.active_workflows} />
                      <MetricCell icon={<IconClock size={11} />} label="Last tick" value={timeAgo(status.last_tick_at)} isText />
                    </div>

                    {/* Error indicator */}
                    {status.activity_24h.errors > 0 && (
                      <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-destructive/5">
                        <IconAlertCircle size={12} className="text-destructive" />
                        <span className="text-xs text-destructive">
                          {status.activity_24h.errors} error{status.activity_24h.errors !== 1 ? 's' : ''} in last 24h
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponent
// ---------------------------------------------------------------------------

function MetricCell({ icon, label, value, isText = false }: {
  icon: React.ReactNode
  label: string
  value: number | string
  isText?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground flex">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-foreground ml-auto ${!isText ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

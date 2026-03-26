'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DollarSign,
  MessageSquare,
  TrendingUp,
  Clock,
  Workflow,
  Power,
  AlertCircle,
  Zap,
  Lightbulb,
} from 'lucide-react'
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
// Style tokens
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
  transition: 'all 200ms',
  cursor: 'pointer',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_META: Record<RoleType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  finance: { label: 'Finance', icon: DollarSign, color: '#22c55e', description: 'Invoices, payments, cash flow' },
  comms: { label: 'Communications', icon: MessageSquare, color: '#3b82f6', description: 'Email triage, responses, follow-ups' },
  sales: { label: 'Sales', icon: TrendingUp, color: '#F1F5F9', description: 'Leads, proposals, pipeline' },
}

const AUTONOMY_LABELS: Record<AutonomyLevel, { label: string; color: string }> = {
  observer: { label: 'Observer', color: '#94A3B8' },
  copilot: { label: 'Co-pilot', color: '#3b82f6' },
  autopilot: { label: 'Autopilot', color: '#22c55e' },
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
  const [hoveredRole, setHoveredRole] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/roles/status')
      if (!res.ok) return
      const data = await res.json()
      setRoles(data.roles ?? [])
    } catch {
      // Silently fail — cards show empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Ensure all 3 role types appear even if not yet configured
  const allRoleTypes: RoleType[] = ['finance', 'comms', 'sales']
  const roleMap = new Map(roles.map(r => [r.role_type, r]))

  if (loading) {
    return (
      <div>
        <div style={sectionHeader}>Role Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {allRoleTypes.map(rt => (
            <div key={rt} style={{ ...glassCard, opacity: 0.5, cursor: 'default' }}>
              <div style={{ height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '40%', marginBottom: 12 }} />
              <div style={{ height: 32, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '60%', marginBottom: 8 }} />
              <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '80%' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={sectionHeader}>Role Status</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {allRoleTypes.map(rt => {
          const status = roleMap.get(rt)
          const meta = ROLE_META[rt]
          const Icon = meta.icon
          const isHovered = hoveredRole === rt
          const isConfigured = !!status
          const autonomy = status ? AUTONOMY_LABELS[status.autonomy_level] : null

          return (
            <div
              key={rt}
              onMouseEnter={() => setHoveredRole(rt)}
              onMouseLeave={() => setHoveredRole(null)}
              onClick={() => onRoleClick?.(rt)}
              style={{
                ...glassCard,
                border: isHovered
                  ? '1px solid rgba(255, 255, 255, 0.1)'
                  : '1px solid rgba(255, 255, 255, 0.03)',
                background: isHovered
                  ? 'var(--bb-surface-hover, rgba(20, 28, 40, 0.7))'
                  : 'rgba(15, 20, 30, 0.6)',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 12,
                    background: `${meta.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginTop: 1 }}>
                      {meta.description}
                    </div>
                  </div>
                </div>

                {/* Status dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isConfigured && status.enabled ? '#22c55e' : 'var(--text-dim, #475569)',
                  boxShadow: isConfigured && status.enabled ? '0 0 8px rgba(34, 197, 94, 0.4)' : 'none',
                }} />
              </div>

              {!isConfigured ? (
                <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', padding: '8px 0' }}>
                  Not configured
                </div>
              ) : (
                <>
                  {/* Autonomy + State */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    {autonomy && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                        background: `${autonomy.color}15`,
                        color: autonomy.color,
                      }}>
                        {autonomy.label}
                      </span>
                    )}
                    {!status.enabled && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#ef4444',
                      }}>
                        Disabled
                      </span>
                    )}
                  </div>

                  {/* Metrics row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    padding: '12px 0',
                    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
                  }}>
                    <MetricCell
                      icon={<Zap size={11} />}
                      label="Actions"
                      value={status.activity_24h.actions}
                    />
                    <MetricCell
                      icon={<Lightbulb size={11} />}
                      label="Insights"
                      value={status.activity_24h.insights}
                    />
                    <MetricCell
                      icon={<Workflow size={11} />}
                      label="Workflows"
                      value={status.active_workflows}
                    />
                    <MetricCell
                      icon={<Clock size={11} />}
                      label="Last tick"
                      value={timeAgo(status.last_tick_at)}
                      isText
                    />
                  </div>

                  {/* Error indicator */}
                  {status.activity_24h.errors > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.08)',
                    }}>
                      <AlertCircle size={12} style={{ color: '#ef4444' }} />
                      <span style={{ fontSize: 14, color: '#ef4444' }}>
                        {status.activity_24h.errors} error{status.activity_24h.errors !== 1 ? 's' : ''} in last 24h
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--text-dim, #475569)', display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>{label}</span>
      <span style={{
        fontSize: isText ? 14 : 14,
        fontWeight: isText ? 400 : 500,
        color: 'var(--text-primary, #F1F5F9)',
        fontFamily: isText ? undefined : 'var(--font-mono)',
        marginLeft: 'auto',
      }}>
        {value}
      </span>
    </div>
  )
}


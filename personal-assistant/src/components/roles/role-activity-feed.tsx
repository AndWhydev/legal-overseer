'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Activity,
  Zap,
  AlertTriangle,
  Brain,
  XCircle,
  Workflow,
  Lightbulb,
  Filter,
} from 'lucide-react'
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
// Style tokens
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  backdropFilter: 'blur(26px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: 'none',
  transition: 'background 200ms',
  cursor: 'default',
  gap: 12,
}

const pillBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 20,
  background: 'rgba(10, 14, 23, 0.42)',
  backdropFilter: 'blur(22px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  border: 'none',
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  cursor: 'pointer',
  transition: 'all 200ms',
}

const activePill: React.CSSProperties = {
  ...pillBtn,
  color: 'var(--text-primary, #F1F5F9)',
  background: 'rgba(255, 90, 31, 0.15)',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  action: Zap,
  insight: Lightbulb,
  escalation: AlertTriangle,
  learning: Brain,
  error: XCircle,
  workflow_step: Workflow,
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  action: '#FF5A1F',
  insight: '#3b82f6',
  escalation: '#eab308',
  learning: '#8b5cf6',
  error: '#ef4444',
  workflow_step: '#94A3B8',
}

const ROLE_LABELS: Record<RoleType, string> = {
  finance: 'Finance',
  comms: 'Comms',
  sales: 'Sales',
}

const ROLE_COLORS: Record<RoleType, string> = {
  finance: '#22c55e',
  comms: '#3b82f6',
  sales: '#FF5A1F',
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
    const interval = setInterval(fetchActivity, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [fetchActivity])

  // Priority sort: escalations first, then actions, then insights
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
    <div style={glassCard}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} style={{ color: '#FF5A1F' }} />
          <span style={sectionHeader}>Role Activity</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={12} style={{ color: 'var(--text-dim, #475569)' }} />
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'finance', 'comms', 'sales'] as const).map(role => (
          <button
            key={role}
            onClick={() => setRoleFilter(role)}
            style={roleFilter === role ? activePill : pillBtn}
          >
            {role === 'all' ? 'All Roles' : ROLE_LABELS[role]}
          </button>
        ))}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
        {(['all', 'escalation', 'action', 'insight', 'error'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            style={typeFilter === type ? activePill : pillBtn}
          >
            {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div style={{ overflowY: 'auto', maxHeight, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ ...listRow, opacity: 0.5 }}>
              <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '70%', marginBottom: 8 }} />
                <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '40%' }} />
              </div>
            </div>
          ))
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim, #475569)', fontSize: 14 }}>
            Failed to load activity
          </div>
        ) : sortedActivities.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Activity size={28} style={{ color: 'var(--text-dim, #475569)', marginBottom: 8 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>No role activity yet</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginTop: 4 }}>
              Activity will appear as roles process work
            </div>
          </div>
        ) : (
          sortedActivities.map(item => {
            const Icon = ACTIVITY_ICONS[item.activity_type] ?? Activity
            const color = ACTIVITY_COLORS[item.activity_type] ?? '#94A3B8'
            const isHovered = hoveredId === item.id

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...listRow,
                  background: isHovered ? 'rgba(20, 28, 40, 0.7)' : 'rgba(10, 14, 23, 0.5)',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  <Icon size={14} style={{ color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', lineHeight: 1.4 }}>
                    {item.summary}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    {item.role_type && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                        background: `${ROLE_COLORS[item.role_type]}15`,
                        color: ROLE_COLORS[item.role_type],
                      }}>
                        {ROLE_LABELS[item.role_type]}
                      </span>
                    )}
                    {item.confidence != null && (
                      <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)', fontFamily: 'var(--font-mono)' }}>
                        {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                    <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Activity,
  Zap,
  Lightbulb,
  AlertTriangle,
  Brain,
  XCircle,
  Workflow,
  Clock,
  Settings,
} from 'lucide-react'
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
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: 'none',
  transition: 'background 200ms',
  gap: 12,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_META: Record<RoleType, { label: string; icon: React.ElementType; color: string }> = {
  finance: { label: 'Finance', icon: DollarSign, color: '#22c55e' },
  comms: { label: 'Communications', icon: MessageSquare, color: '#3b82f6' },
  sales: { label: 'Sales', icon: TrendingUp, color: '#FF5A1F' },
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Back button + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'transparent',
            color: 'var(--text-primary, #F1F5F9)',
            cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: `${meta.color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <RoleIcon size={18} style={{ color: meta.color }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', letterSpacing: '-0.02em' }}>
            {meta.label} Role
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', marginTop: 2 }}>
            Full activity history and configuration
          </div>
        </div>
      </div>

      {/* Status + Autonomy row */}
      {status && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Status card */}
          <div style={glassCard}>
            <div style={sectionHeader}>Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <StatCell label="Last tick" value={timeAgo(status.last_tick_at)} />
              <StatCell label="Active workflows" value={String(status.active_workflows)} mono />
              <StatCell label="Actions (24h)" value={String(status.activity_24h.actions)} mono />
              <StatCell label="Insights (24h)" value={String(status.activity_24h.insights)} mono />
              <StatCell label="Escalations (24h)" value={String(status.activity_24h.escalations)} mono />
              <StatCell label="Errors (24h)" value={String(status.activity_24h.errors)} mono />
            </div>
          </div>

          {/* Autonomy card */}
          <div style={glassCard}>
            <div style={{ ...sectionHeader, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={11} />
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
      <div style={glassCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Activity size={14} style={{ color: meta.color }} />
          <span style={sectionHeader}>Activity Timeline</span>
          <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginLeft: 'auto' }}>
            {activities.length} events
          </span>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 450px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{ ...listRow, opacity: 0.5 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '60%', marginBottom: 8 }} />
                  <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '30%' }} />
                </div>
              </div>
            ))
          ) : activities.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Activity size={28} style={{ color: 'var(--text-dim, #475569)', marginBottom: 8 }} />
              <div style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>No activity yet</div>
            </div>
          ) : (
            activities.map(item => {
              const ItemIcon = ACTIVITY_ICONS[item.activity_type] ?? Activity
              const color = ACTIVITY_COLORS[item.activity_type] ?? '#94A3B8'
              const isHovered = hoveredId === item.id
              const isExpanded = expandedId === item.id

              return (
                <div key={item.id}>
                  <div
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    style={{
                      ...listRow,
                      cursor: 'pointer',
                      background: isHovered ? 'rgba(20, 28, 40, 0.7)' : 'rgba(10, 14, 23, 0.5)',
                    }}
                  >
                    {/* Timeline dot */}
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      background: `${color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <ItemIcon size={12} style={{ color }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', lineHeight: 1.4 }}>
                        {item.summary}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: `${color}15`,
                          color,
                          textTransform: 'capitalize' as const,
                        }}>
                          {item.activity_type.replace('_', ' ')}
                        </span>
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

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 2,
                      marginLeft: 36,
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: 'rgba(10, 14, 23, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.03)',
                      fontSize: 14,
                      color: 'var(--text-secondary, #94A3B8)',
                      lineHeight: 1.6,
                    }}>
                      {item.reasoning && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Reasoning: </span>
                          {item.reasoning}
                        </div>
                      )}
                      {item.autonomy_mode && (
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>Mode:</span> {item.autonomy_mode}
                        </div>
                      )}
                      {item.reversible != null && (
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>Reversible:</span> {item.reversible ? 'Yes' : 'No'}
                        </div>
                      )}
                      {Object.keys(item.details).length > 0 && (
                        <div>
                          <span style={{ fontWeight: 500 }}>Details:</span>
                          <pre style={{
                            marginTop: 4,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(10, 14, 23, 0.5)',
                            fontSize: 14,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-dim, #475569)',
                            overflow: 'auto',
                            maxHeight: 200,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
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
      <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 14,
        fontWeight: mono ? 500 : 500,
        color: 'var(--text-primary, #F1F5F9)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>
        {value}
      </div>
    </div>
  )
}

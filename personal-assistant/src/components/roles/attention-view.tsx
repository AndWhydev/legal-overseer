'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Lightbulb,
  ShieldCheck,
} from 'lucide-react'
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
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim, #475569)',
  marginBottom: 12,
}

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  backdropFilter: 'blur(26px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.15)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  border: 'none',
  transition: 'background 200ms',
  gap: 12,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  approval: { icon: ShieldCheck, color: '#FF5A1F', label: 'Approval needed' },
  escalation: { icon: AlertTriangle, color: '#eab308', label: 'Escalation' },
  insight: { icon: Lightbulb, color: '#3b82f6', label: 'Needs review' },
}

const ROLE_LABELS: Record<string, string> = {
  finance: 'Finance',
  comms: 'Comms',
  sales: 'Sales',
}

const ROLE_COLORS: Record<string, string> = {
  finance: '#22c55e',
  comms: '#3b82f6',
  sales: '#FF5A1F',
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Urgent', color: '#ef4444' },
  1: { label: 'High', color: '#eab308' },
  2: { label: 'Medium', color: '#94A3B8' },
  3: { label: 'Low', color: '#475569' },
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
    const interval = setInterval(fetchAttention, 15000) // poll every 15s for attention items
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
        // Remove from list optimistically
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
    <div style={glassCard}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} style={{ color: '#FF5A1F' }} />
          <span style={sectionHeader}>Needs Your Attention</span>
          {counts.total > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 20,
              height: 20,
              padding: '0 6px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              background: '#FF5A1F',
              color: '#000',
              fontFamily: 'var(--font-mono)',
            }}>
              {counts.total}
            </span>
          )}
        </div>
      </div>

      {/* Item list */}
      <div style={{ overflowY: 'auto', maxHeight, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={{ ...listRow, opacity: 0.5 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '60%', marginBottom: 8 }} />
                <div style={{ height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '35%' }} />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <CheckCircle2 size={28} style={{ color: '#22c55e', marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>All clear</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim, #475569)', marginTop: 4 }}>
              No items need your attention right now
            </div>
          </div>
        ) : (
          items.map(item => {
            const sourceMeta = SOURCE_META[item.source] ?? SOURCE_META.insight
            const Icon = sourceMeta.icon
            const priorityMeta = PRIORITY_LABELS[item.priority] ?? PRIORITY_LABELS[2]
            const isHovered = hoveredId === item.id
            const isResolving = resolvingId === item.source_id

            return (
              <div
                key={item.id}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...listRow,
                  background: isHovered ? 'rgba(20, 28, 40, 0.7)' : 'rgba(10, 14, 23, 0.5)',
                  opacity: isResolving ? 0.5 : 1,
                }}
              >
                {/* Priority indicator */}
                <div style={{
                  width: 3,
                  height: '100%',
                  minHeight: 40,
                  borderRadius: 2,
                  background: priorityMeta.color,
                  flexShrink: 0,
                  alignSelf: 'stretch',
                }} />

                {/* Icon */}
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `${sourceMeta.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={14} style={{ color: sourceMeta.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', lineHeight: 1.4 }}>
                    {item.summary}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: `${sourceMeta.color}15`,
                      color: sourceMeta.color,
                    }}>
                      {sourceMeta.label}
                    </span>
                    {item.role_type && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: `${ROLE_COLORS[item.role_type] ?? '#94A3B8'}15`,
                        color: ROLE_COLORS[item.role_type] ?? '#94A3B8',
                      }}>
                        {ROLE_LABELS[item.role_type] ?? item.role_type}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-dim, #475569)' }}>
                      {timeAgo(item.created_at)}
                    </span>
                  </div>

                  {/* Action buttons for approvals */}
                  {item.source === 'approval' && isHovered && !isResolving && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproval(item.source_id, 'approved') }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: '#22c55e',
                          transition: 'all 200ms',
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproval(item.source_id, 'rejected') }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: 'rgba(239, 68, 68, 0.12)',
                          color: '#ef4444',
                          transition: 'all 200ms',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

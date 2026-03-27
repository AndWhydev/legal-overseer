'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabShell } from '@/components/ui/tab-shell'
import { TabSkeleton } from './tab-skeleton'
import { AlertBanner } from '@/components/ui/alert-banner'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Users,
  Send,
  BarChart3,
  MessageSquare,
  Zap,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Check,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaitlistEntry {
  id: string
  email: string
  referral_source: string
  status: string
  created_at: string
  invited_at: string | null
}

interface OrgMetric {
  org_id: string
  org_name: string
  plan: string
  active_days_7d: number
  total_messages_7d: number
  total_agent_runs_7d: number
  total_tokens_7d: number
  total_cost_7d: number
  error_count_7d: number
  feedback_count: number
  last_active: string | null
}

interface MetricsSummary {
  total_orgs: number
  active_orgs_7d: number
  total_agent_runs_7d: number
  total_messages_7d: number
  total_cost_7d: number
  total_errors_7d: number
  total_feedback: number
}

interface FeedbackEntry {
  id: string
  category: string
  message: string
  status: string
  created_at: string
  page_url: string | null
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  borderRadius: 16,
}

const statCard: React.CSSProperties = {
  ...glassCard,
  padding: 20,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
}

const sectionHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const headerTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: 14,
}

const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left' as const,
  fontWeight: 500,
  color: 'var(--text-secondary, #94A3B8)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  fontSize: 13,
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  color: 'var(--text-primary, #F1F5F9)',
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 500,
  background: active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
  color: active ? '#22c55e' : 'var(--text-dim, #475569)',
})

const actionBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const secondaryBtn: React.CSSProperties = {
  ...actionBtn,
  background: 'var(--bg-elevated, rgba(25, 35, 50, 0.8))',
  color: 'var(--text-primary, #F1F5F9)',
  border: '1px solid var(--border-subtle)',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession()
  return data.session?.access_token ?? null
}

function formatDate(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#94A3B8',
  invited: '#eab308',
  accepted: '#22c55e',
  expired: '#ef4444',
}

const CATEGORY_COLORS: Record<string, string> = {
  bug: '#ef4444',
  feature: '#3b82f6',
  ux: '#a855f7',
  performance: '#f59e0b',
  other: '#94A3B8',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BetaAdminTab() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [client, setClient] = useState<SupabaseClient | null>(null)

  // Waitlist
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistTotal, setWaitlistTotal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ sent: number; errors: number } | null>(null)

  // Metrics
  const [metrics, setMetrics] = useState<OrgMetric[]>([])
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Feedback
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  // Init
  useEffect(() => {
    const c = createClient()
    if (!c) return
    setClient(c)
    ;(async () => {
      const { data: { user } } = await c.auth.getUser()
      if (!user) { setIsAdmin(false); return }
      const { data: profile } = await c.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })()
  }, [])

  // Fetch data when admin confirmed
  const fetchWaitlist = useCallback(async () => {
    if (!client) return
    setWaitlistLoading(true)
    try {
      const token = await getToken(client)
      const res = await fetch('/api/admin/beta-invite', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setWaitlist(data.entries ?? [])
        setWaitlistTotal(data.total ?? 0)
      }
    } finally {
      setWaitlistLoading(false)
    }
  }, [client])

  const fetchMetrics = useCallback(async () => {
    if (!client) return
    setMetricsLoading(true)
    try {
      const token = await getToken(client)
      const res = await fetch('/api/admin/beta-metrics', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics ?? [])
        setSummary(data.summary ?? null)
      }
    } finally {
      setMetricsLoading(false)
    }
  }, [client])

  const fetchFeedback = useCallback(async () => {
    if (!client) return
    setFeedbackLoading(true)
    try {
      const token = await getToken(client)
      const res = await fetch('/api/beta/feedback?limit=30', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setFeedback(data.feedback ?? [])
      }
    } finally {
      setFeedbackLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (isAdmin) {
      fetchWaitlist()
      fetchMetrics()
      fetchFeedback()
    }
  }, [isAdmin, fetchWaitlist, fetchMetrics, fetchFeedback])

  // Send invites
  const handleSendInvites = useCallback(async () => {
    if (!client || selectedIds.size === 0) return
    setInviting(true)
    setInviteResult(null)
    try {
      const token = await getToken(client)
      const res = await fetch('/api/admin/beta-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ waitlist_ids: Array.from(selectedIds) }),
      })
      if (res.ok) {
        const data = await res.json()
        setInviteResult({ sent: data.summary?.sent ?? 0, errors: data.summary?.errors ?? 0 })
        setSelectedIds(new Set())
        fetchWaitlist()
      }
    } finally {
      setInviting(false)
    }
  }, [client, selectedIds, fetchWaitlist])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pendingIds = waitlist.filter(e => e.status === 'pending').map(e => e.id)
    if (pendingIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingIds))
    }
  }

  // Guard
  if (isAdmin === null) return <TabSkeleton />
  if (!isAdmin) {
    return (
      <TabShell>
        <div style={{ padding: 32 }}>
          <AlertBanner variant="error">
            <div>
              <h2 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 4, fontWeight: 500 }}>Access Denied</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Admin role required.</p>
            </div>
          </AlertBanner>
        </div>
      </TabShell>
    )
  }

  return (
    <TabShell>
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Summary Stats */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Users size={14} /> <span style={{ fontSize: 12 }}>Total Orgs</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.total_orgs}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{summary.active_orgs_7d} active (7d)</div>
            </div>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <Zap size={14} /> <span style={{ fontSize: 12 }}>Agent Runs</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.total_agent_runs_7d}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>7-day total</div>
            </div>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <MessageSquare size={14} /> <span style={{ fontSize: 12 }}>Messages</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.total_messages_7d}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>7-day total</div>
            </div>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <DollarSign size={14} /> <span style={{ fontSize: 12 }}>Token Cost</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCost(summary.total_cost_7d)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>7-day total</div>
            </div>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <AlertTriangle size={14} /> <span style={{ fontSize: 12 }}>Errors</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: summary.total_errors_7d > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                {summary.total_errors_7d}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>7-day total</div>
            </div>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                <MessageSquare size={14} /> <span style={{ fontSize: 12 }}>Feedback</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.total_feedback}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>all time</div>
            </div>
          </div>
        )}

        {/* Waitlist Management */}
        <div style={glassCard}>
          <div style={sectionHeader}>
            <div style={headerTitle}>
              <Users size={18} />
              Waitlist ({waitlistTotal})
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleSendInvites}
                  disabled={inviting}
                  style={{ ...actionBtn, opacity: inviting ? 0.5 : 1 }}
                >
                  {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Invite {selectedIds.size} Selected
                </button>
              )}
              <button onClick={fetchWaitlist} disabled={waitlistLoading} style={secondaryBtn}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div style={{ padding: 0, overflow: 'auto' }}>
            {inviteResult && (
              <div style={{ padding: '12px 20px', background: 'rgba(34, 197, 94, 0.08)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} style={{ color: '#22c55e' }} />
                <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  {inviteResult.sent} invite(s) sent{inviteResult.errors > 0 ? `, ${inviteResult.errors} error(s)` : ''}
                </span>
              </div>
            )}
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 40 }}>
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={waitlist.filter(e => e.status === 'pending').length > 0 && waitlist.filter(e => e.status === 'pending').every(e => selectedIds.has(e.id))}
                    />
                  </th>
                  <th style={th}>Email</th>
                  <th style={th}>Source</th>
                  <th style={th}>Status</th>
                  <th style={th}>Joined</th>
                  <th style={th}>Invited</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(entry => (
                  <tr key={entry.id} style={{ cursor: entry.status === 'pending' ? 'pointer' : 'default' }}>
                    <td style={td}>
                      {entry.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                        />
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 13 }}>{entry.email}</td>
                    <td style={td}>{entry.referral_source}</td>
                    <td style={td}>
                      <span style={{
                        ...pillStyle(entry.status === 'accepted'),
                        color: STATUS_COLORS[entry.status] ?? 'var(--text-dim)',
                        background: entry.status === 'accepted' ? 'rgba(34, 197, 94, 0.12)' :
                                   entry.status === 'invited' ? 'rgba(234, 179, 8, 0.12)' :
                                   'rgba(255, 255, 255, 0.04)',
                      }}>
                        {entry.status}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatDate(entry.created_at)}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatDate(entry.invited_at)}</td>
                  </tr>
                ))}
                {waitlist.length === 0 && !waitlistLoading && (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No waitlist entries</td></tr>
                )}
                {waitlistLoading && (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-Org Metrics */}
        <div style={glassCard}>
          <div style={sectionHeader}>
            <div style={headerTitle}>
              <BarChart3 size={18} />
              Per-Org Metrics (7 Day)
            </div>
            <button onClick={fetchMetrics} disabled={metricsLoading} style={secondaryBtn}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div style={{ padding: 0, overflow: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Organization</th>
                  <th style={th}>Plan</th>
                  <th style={{ ...th, textAlign: 'right' }}>Active Days</th>
                  <th style={{ ...th, textAlign: 'right' }}>Messages</th>
                  <th style={{ ...th, textAlign: 'right' }}>Agent Runs</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tokens</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cost</th>
                  <th style={{ ...th, textAlign: 'right' }}>Errors</th>
                  <th style={{ ...th, textAlign: 'right' }}>Feedback</th>
                  <th style={th}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => (
                  <tr key={m.org_id}>
                    <td style={{ ...td, fontWeight: 500 }}>{m.org_name}</td>
                    <td style={td}>
                      <span style={pillStyle(m.plan === 'growth')}>{m.plan}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{m.active_days_7d}/7</td>
                    <td style={{ ...td, textAlign: 'right' }}>{m.total_messages_7d}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{m.total_agent_runs_7d}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                      {m.total_tokens_7d.toLocaleString()}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>
                      {formatCost(m.total_cost_7d)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: m.error_count_7d > 0 ? '#ef4444' : 'var(--text-primary)' }}>
                      {m.error_count_7d}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{m.feedback_count}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatDate(m.last_active)}</td>
                  </tr>
                ))}
                {metrics.length === 0 && !metricsLoading && (
                  <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No organizations</td></tr>
                )}
                {metricsLoading && (
                  <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading metrics...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Feedback */}
        <div style={glassCard}>
          <div style={sectionHeader}>
            <div style={headerTitle}>
              <MessageSquare size={18} />
              Recent Feedback
            </div>
            <button onClick={fetchFeedback} disabled={feedbackLoading} style={secondaryBtn}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div style={{ padding: 0, overflow: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Category</th>
                  <th style={th}>Message</th>
                  <th style={th}>Status</th>
                  <th style={th}>Page</th>
                  <th style={th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map(f => (
                  <tr key={f.id}>
                    <td style={td}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        background: `${CATEGORY_COLORS[f.category] ?? '#94A3B8'}1A`,
                        color: CATEGORY_COLORS[f.category] ?? '#94A3B8',
                      }}>
                        {f.category}
                      </span>
                    </td>
                    <td style={{ ...td, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.message}
                    </td>
                    <td style={td}>
                      <span style={pillStyle(f.status === 'resolved')}>{f.status}</span>
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 13 }}>{f.page_url ?? '--'}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatDate(f.created_at)}</td>
                  </tr>
                ))}
                {feedback.length === 0 && !feedbackLoading && (
                  <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No feedback yet</td></tr>
                )}
                {feedbackLoading && (
                  <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </TabShell>
  )
}

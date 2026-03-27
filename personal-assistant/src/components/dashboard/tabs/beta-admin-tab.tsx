'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabShell } from '@/components/ui/tab-shell'
import { TabSkeleton } from './tab-skeleton'
import { AlertBanner } from '@/components/ui/alert-banner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  IconUsers,
  IconSend,
  IconChartBar,
  IconMessage,
  IconBolt,
  IconCurrencyDollar,
  IconAlertTriangle,
  IconRefresh,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react'

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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  invited: 'outline',
  accepted: 'default',
  expired: 'destructive',
}

const CATEGORY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  bug: 'destructive',
  feature: 'default',
  ux: 'secondary',
  performance: 'outline',
  other: 'secondary',
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
        <div className="p-8">
          <AlertBanner variant="error">
            <div>
              <h2 className="text-base font-medium text-foreground">Access Denied</h2>
              <p className="text-sm text-muted-foreground">Admin role required.</p>
            </div>
          </AlertBanner>
        </div>
      </TabShell>
    )
  }

  return (
    <TabShell>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {[
              { icon: IconUsers, label: 'Total Orgs', value: summary.total_orgs, sub: `${summary.active_orgs_7d} active (7d)` },
              { icon: IconBolt, label: 'Agent Runs', value: summary.total_agent_runs_7d, sub: '7-day total' },
              { icon: IconMessage, label: 'Messages', value: summary.total_messages_7d, sub: '7-day total' },
              { icon: IconCurrencyDollar, label: 'Token Cost', value: formatCost(summary.total_cost_7d), sub: '7-day total' },
              { icon: IconAlertTriangle, label: 'Errors', value: summary.total_errors_7d, sub: '7-day total', error: summary.total_errors_7d > 0 },
              { icon: IconMessage, label: 'Feedback', value: summary.total_feedback, sub: 'all time' },
            ].map((stat) => (
              <Card key={stat.label} className="py-4">
                <CardContent className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <stat.icon className="size-3.5" />
                    <span className="text-xs">{stat.label}</span>
                  </div>
                  <div className={cn(
                    'text-2xl font-bold tabular-nums',
                    stat.error ? 'text-destructive' : 'text-foreground'
                  )}>
                    {stat.value}
                  </div>
                  <div className="text-xs text-muted-foreground">{stat.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Waitlist Management */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconUsers className="size-4" />
              Waitlist ({waitlistTotal})
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <Button onClick={handleSendInvites} disabled={inviting}>
                  {inviting ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconSend className="size-3.5" />}
                  Invite {selectedIds.size} Selected
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={fetchWaitlist} disabled={waitlistLoading}>
                <IconRefresh className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {inviteResult && (
              <div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-5 py-3">
                <IconCheck className="size-4 text-emerald-500" />
                <span className="text-sm text-foreground">
                  {inviteResult.sent} invite(s) sent{inviteResult.errors > 0 ? `, ${inviteResult.errors} error(s)` : ''}
                </span>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      onCheckedChange={toggleSelectAll}
                      checked={waitlist.filter(e => e.status === 'pending').length > 0 && waitlist.filter(e => e.status === 'pending').every(e => selectedIds.has(e.id))}
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Invited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist.map(entry => (
                  <TableRow key={entry.id} className={cn(entry.status === 'pending' && 'cursor-pointer')}>
                    <TableCell>
                      {entry.status === 'pending' && (
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => toggleSelect(entry.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.email}</TableCell>
                    <TableCell>{entry.referral_source}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'}>
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(entry.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(entry.invited_at)}</TableCell>
                  </TableRow>
                ))}
                {waitlist.length === 0 && !waitlistLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No waitlist entries</TableCell>
                  </TableRow>
                )}
                {waitlistLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Per-Org Metrics */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconChartBar className="size-4" />
              Per-Org Metrics (7 Day)
            </CardTitle>
            <Button variant="outline" size="icon" onClick={fetchMetrics} disabled={metricsLoading}>
              <IconRefresh className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Active Days</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-right">Agent Runs</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Feedback</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map(m => (
                  <TableRow key={m.org_id}>
                    <TableCell className="font-medium">{m.org_name}</TableCell>
                    <TableCell>
                      <Badge variant={m.plan === 'growth' ? 'default' : 'secondary'}>{m.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.active_days_7d}/7</TableCell>
                    <TableCell className="text-right">{m.total_messages_7d}</TableCell>
                    <TableCell className="text-right">{m.total_agent_runs_7d}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {m.total_tokens_7d.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatCost(m.total_cost_7d)}
                    </TableCell>
                    <TableCell className={cn('text-right', m.error_count_7d > 0 && 'text-destructive')}>
                      {m.error_count_7d}
                    </TableCell>
                    <TableCell className="text-right">{m.feedback_count}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(m.last_active)}</TableCell>
                  </TableRow>
                ))}
                {metrics.length === 0 && !metricsLoading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">No organizations</TableCell>
                  </TableRow>
                )}
                {metricsLoading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">Loading metrics...</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Feedback */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <IconMessage className="size-4" />
              Recent Feedback
            </CardTitle>
            <Button variant="outline" size="icon" onClick={fetchFeedback} disabled={feedbackLoading}>
              <IconRefresh className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feedback.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Badge variant={CATEGORY_VARIANT[f.category] ?? 'secondary'}>
                        {f.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[400px] truncate">{f.message}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === 'resolved' ? 'default' : 'secondary'}>{f.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.page_url ?? '--'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(f.created_at)}</TableCell>
                  </TableRow>
                ))}
                {feedback.length === 0 && !feedbackLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">No feedback yet</TableCell>
                  </TableRow>
                )}
                {feedbackLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </TabShell>
  )
}

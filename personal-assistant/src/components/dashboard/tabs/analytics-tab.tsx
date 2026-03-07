'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabSkeleton } from './tab-skeleton'
import { TabShell } from '@/components/ui/tab-shell'
import {
  DollarSign,
  Users,
  TrendingDown,
  TrendingUp,
  Cpu,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MRRData {
  totalMRR: number
  activeSubscriptions: number
  churnedThisMonth: number
  churnRate: number
  expansionRevenue: number
  netNewMRR: number
  byTier: Record<string, { count: number; mrr: number }>
}

interface AgentUsage {
  agentType: string
  inputTokens: number
  outputTokens: number
  invocations: number
  costUSD: number
}

interface ClientCost {
  clientName: string
  tokens: number
  costUSD: number
  actions: number
}

interface UsageData {
  totalTokens: number
  totalCostUSD: number
  byAgent: AgentUsage[]
  byClient: ClientCost[]
}

interface ChurnRisk {
  orgId: string
  orgName: string
  riskScore: number
  signals: Array<{ type: string; description: string }>
  plan: string
}

interface AnalyticsData {
  mrr: MRRData
  usage: UsageData | null
  churn: {
    atRiskOrgs: number
    risks: ChurnRisk[]
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = createClient()
    if (!client) {
      setLoading(false)
      setError('Database not configured')
      return
    }

    fetch('/api/analytics?type=all')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((d: AnalyticsData) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  if (loading) return <TabSkeleton />

  if (error || !data) {
    return (
      <TabShell>
        <div className="p-6">
          <p style={{ color: 'var(--text-secondary)' }}>
            {error ?? 'No analytics data available. Connect your billing to see MRR metrics.'}
          </p>
        </div>
      </TabShell>
    )
  }

  const { mrr, usage, churn } = data

  return (
    <TabShell>
      <div className="p-6 space-y-8" style={{ color: 'var(--text-primary)' }}>

        {/* MRR Stats */}
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
            Monthly Recurring Revenue
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={DollarSign} label="Total MRR" value={`$${mrr.totalMRR.toLocaleString()}`} />
            <StatCard icon={Users} label="Active Subs" value={String(mrr.activeSubscriptions)} />
            <StatCard icon={TrendingDown} label="Churn Rate" value={`${mrr.churnRate}%`} alert={mrr.churnRate > 5} />
            <StatCard icon={TrendingUp} label="Net New MRR" value={`$${mrr.netNewMRR.toLocaleString()}`} />
          </div>

          {/* MRR by Tier */}
          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}>
            <h4 className="text-sm font-medium mb-3">Revenue by Tier</h4>
            <div className="space-y-2">
              {Object.entries(mrr.byTier).map(([tier, info]) => {
                const pct = mrr.totalMRR > 0 ? (info.mrr / mrr.totalMRR) * 100 : 0
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="text-sm w-20 capitalize">{tier}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${pct}%`, background: 'var(--bb-blue, #3b82f6)' }}
                      />
                    </div>
                    <span className="text-sm w-24 text-right" style={{ color: 'var(--text-secondary)' }}>
                      ${info.mrr} ({info.count})
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Token Usage */}
        {usage && (
          <section>
            <h3 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
              Token Usage &amp; Costs
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard icon={Cpu} label="Total Tokens" value={formatTokens(usage.totalTokens)} />
              <StatCard icon={DollarSign} label="Total Cost" value={`$${usage.totalCostUSD.toFixed(2)}`} />
            </div>

            {/* By Agent */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    <th className="text-left px-4 py-2 font-medium">Agent</th>
                    <th className="text-right px-4 py-2 font-medium">Invocations</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byAgent.map((a) => (
                    <tr key={a.agentType} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="px-4 py-2 capitalize">{a.agentType.replace(/-/g, ' ')}</td>
                      <td className="px-4 py-2 text-right">{a.invocations}</td>
                      <td className="px-4 py-2 text-right">{formatTokens(a.inputTokens + a.outputTokens)}</td>
                      <td className="px-4 py-2 text-right">${a.costUSD.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* By Client */}
            {usage.byClient.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Cost per Client</h4>
                <div className="space-y-1">
                  {usage.byClient
                    .sort((a, b) => b.costUSD - a.costUSD)
                    .slice(0, 10)
                    .map((c) => (
                      <div key={c.clientName} className="flex items-center justify-between text-sm px-2 py-1">
                        <span>{c.clientName}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          ${c.costUSD.toFixed(2)} ({c.actions} actions)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Churn Risk */}
        {churn && churn.risks.length > 0 && (
          <section>
            <h3 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
              Churn Risk ({churn.atRiskOrgs} orgs)
            </h3>
            <div className="space-y-2">
              {churn.risks.map((r) => (
                <div
                  key={r.orgId}
                  className="rounded-lg border p-4 flex items-start gap-3"
                  style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
                >
                  <AlertTriangle
                    size={18}
                    className={r.riskScore >= 70 ? 'text-red-500' : r.riskScore >= 50 ? 'text-amber-500' : 'text-yellow-500'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.orgName}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>
                        Risk: {r.riskScore}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {r.signals.map((s) => s.description).join(' | ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ROI Metrics */}
        <section>
          <h3 className="text-sm font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
            ROI Metrics
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              label="Revenue per Sub"
              value={mrr.activeSubscriptions > 0 ? `$${Math.round(mrr.totalMRR / mrr.activeSubscriptions)}` : '$0'}
            />
            <MetricCard
              label="AI Cost per Sub"
              value={
                usage && mrr.activeSubscriptions > 0
                  ? `$${(usage.totalCostUSD / mrr.activeSubscriptions).toFixed(2)}`
                  : '$0'
              }
            />
            <MetricCard
              label="Gross Margin"
              value={
                usage && mrr.totalMRR > 0
                  ? `${Math.round(((mrr.totalMRR - usage.totalCostUSD) / mrr.totalMRR) * 100)}%`
                  : 'N/A'
              }
            />
          </div>
        </section>
      </div>
    </TabShell>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function StatCard({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: React.ElementType
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
    >
      <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
        <Icon size={14} />
        {label}
      </div>
      <div className={`text-xl font-bold ${alert ? 'text-red-500' : ''}`}>{value}</div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border p-4 text-center"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
    >
      <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

export default React.memo(AnalyticsTab)

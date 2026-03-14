'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TabShell } from '@/components/ui/tab-shell'
import { EmptyState } from '@/components/ui/empty-state'
import { SFDollarsignCircle, SFPerson2, SFArrowDownRight, SFArrowUpRight, SFCpu, SFExclamationmarkTriangle, SFChartBar } from 'sf-symbols-lib'

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
// Style Constants
// ---------------------------------------------------------------------------

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'var(--glass-card-blur)',
  WebkitBackdropFilter: 'var(--glass-card-blur)',
  border: '1px solid var(--glass-card-border)',
  boxShadow: 'var(--glass-card-inset)',
}

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  background: 'var(--glass-pill-bg)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  boxShadow: 'var(--glass-card-inset)',
  border: 'none',
  transition: 'background 200ms',
}

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  marginBottom: 12,
}

const bigNumber: React.CSSProperties = {
  fontSize: 38,
  fontWeight: 700,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  letterSpacing: '-0.03em',
  lineHeight: 1,
}

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  background: `${color}15`,
  color: color,
})

const skeletonStyle: React.CSSProperties = {
  borderRadius: 8,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
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

  if (loading) return <LoadingSkeleton />

  if (error || !data) {
    return (
      <TabShell>
        <EmptyState
          icon={<SFChartBar size={40} />}
          title="No analytics data available"
          description={error ? error : 'Connect your billing system to see MRR metrics, token usage, and churn analysis.'}
        />
      </TabShell>
    )
  }

  const { mrr, usage, churn } = data

  return (
    <TabShell>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 32, color: 'var(--text-primary)' }}>

        {/* MRR Stats */}
        <section>
          <h3 style={sectionHeader}>Monthly Recurring Revenue</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <StatCard icon={SFDollarsignCircle} label="Total MRR" value={`$${mrr.totalMRR.toLocaleString()}`} />
            <StatCard icon={SFPerson2} label="Active Subs" value={String(mrr.activeSubscriptions)} />
            <StatCard icon={SFArrowDownRight} label="Churn Rate" value={`${mrr.churnRate}%`} alert={mrr.churnRate > 5} />
            <StatCard icon={SFArrowUpRight} label="Net New MRR" value={`$${mrr.netNewMRR.toLocaleString()}`} />
          </div>

          {/* MRR by Tier */}
          <div style={{ ...glassCard, position: 'relative' }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Revenue by Tier
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(mrr.byTier).map(([tier, info]) => {
                const pct = mrr.totalMRR > 0 ? (info.mrr / mrr.totalMRR) * 100 : 0
                return (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, minWidth: 80, textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                      {tier}
                    </span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          width: `${pct}%`,
                          background: 'rgba(255, 255, 255, 0.2)',
                          transition: 'width 300ms ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12, minWidth: 100, textAlign: 'right', color: 'var(--text-secondary)' }}>
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
            <h3 style={sectionHeader}>Token Usage &amp; Costs</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
              <StatCard icon={SFCpu} label="Total Tokens" value={formatTokens(usage.totalTokens)} />
              <StatCard icon={SFDollarsignCircle} label="Total Cost" value={`$${usage.totalCostUSD.toFixed(2)}`} />
            </div>

            {/* By Agent */}
            <div style={{ ...glassCard, position: 'relative', marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    gap: 16,
                    padding: '12px 0',
                    borderBottom: '1px solid var(--glass-interactive-border)',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>
                    Agent
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Invocations
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Tokens
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Cost
                  </div>
                </div>
                {usage.byAgent.map((a) => (
                  <div
                    key={a.agentType}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr',
                      gap: 16,
                      padding: '12px 0',
                      borderBottom: '1px solid var(--glass-card-border)',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div style={{ textTransform: 'capitalize' }}>{a.agentType.replace(/-/g, ' ')}</div>
                    <div style={{ textAlign: 'right' }}>{a.invocations}</div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
                      {formatTokens(a.inputTokens + a.outputTokens)}
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
                      ${a.costUSD.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* By Client */}
            {usage.byClient.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
                  Cost per Client
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {usage.byClient
                    .sort((a, b) => b.costUSD - a.costUSD)
                    .slice(0, 10)
                    .map((c) => (
                      <div
                        key={c.clientName}
                        style={{
                          ...listRow,
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {c.clientName}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                          }}
                        >
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
            <h3 style={sectionHeader}>Churn Risk ({churn.atRiskOrgs} orgs)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {churn.risks.map((r) => {
                const riskColor = r.riskScore >= 70 ? 'var(--bb-red)' : r.riskScore >= 50 ? 'var(--bb-amber)' : 'var(--bb-green)'
                return (
                  <div
                    key={r.orgId}
                    style={{
                      ...glassCard,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <SFExclamationmarkTriangle
                        size={18}
                        style={{
                          color: riskColor,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {r.orgName}
                          </span>
                          <span style={badge(riskColor)}>
                            Risk: {r.riskScore}
                          </span>
                        </div>
                        {r.signals.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {r.signals.map((s, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-secondary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 4,
                                    height: 4,
                                    borderRadius: '50%',
                                    background: 'rgba(255, 255, 255, 0.2)',
                                    flexShrink: 0,
                                  }}
                                />
                                {s.description}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ROI Metrics */}
        <section>
          <h3 style={sectionHeader}>ROI Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
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
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <TabShell>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* MRR Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>Monthly Recurring Revenue</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 36, width: '80%' }} />
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, position: 'relative' }}>
            <div style={{ ...skeletonStyle, height: 16, width: '40%', marginBottom: 16 }} />
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ ...skeletonStyle, height: 20, width: '100%' }} />
              </div>
            ))}
          </div>
        </section>

        {/* Usage Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>Token Usage &amp; Costs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 36, width: '80%' }} />
              </div>
            ))}
          </div>
          <div style={{ ...glassCard, position: 'relative' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ ...skeletonStyle, height: 20, width: '100%' }} />
              </div>
            ))}
          </div>
        </section>

        {/* ROI Section Skeleton */}
        <section>
          <h3 style={sectionHeader}>ROI Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...glassCard, position: 'relative' }}>
                <div style={{ ...skeletonStyle, height: 16, width: '60%', marginBottom: 12 }} />
                <div style={{ ...skeletonStyle, height: 28, width: '80%' }} />
              </div>
            ))}
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
      style={{
        ...glassCard,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <Icon size={14} style={{ color: 'var(--text-dim)' }} />
        {label}
      </div>
      <div
        style={{
          ...bigNumber,
          color: alert ? 'var(--bb-red)' : 'var(--text-primary)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        ...glassCard,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default React.memo(AnalyticsTab)

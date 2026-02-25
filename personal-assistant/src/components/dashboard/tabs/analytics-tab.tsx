'use client'

import React from 'react'

interface AgentMetric {
  name: string
  runsToday: number
  avgConfidence: number
  successRate: number
  tokenCost: number
}

interface RevenueMetric {
  invoicesSent: number
  invoicesPaid: number
  overdueCount: number
  totalRevenue: number
  totalOutstanding: number
}

const MOCK_AGENTS: AgentMetric[] = [
  { name: 'Sentry', runsToday: 48, avgConfidence: 0.92, successRate: 0.97, tokenCost: 0.42 },
  { name: 'Lead Swarm', runsToday: 12, avgConfidence: 0.78, successRate: 0.85, tokenCost: 1.23 },
  { name: 'Invoice Flow', runsToday: 6, avgConfidence: 0.88, successRate: 0.95, tokenCost: 0.87 },
  { name: 'Channel Triage', runsToday: 24, avgConfidence: 0.81, successRate: 0.90, tokenCost: 0.65 },
  { name: 'Client Comms', runsToday: 8, avgConfidence: 0.75, successRate: 0.88, tokenCost: 1.54 },
]

const MOCK_REVENUE: RevenueMetric = {
  invoicesSent: 12,
  invoicesPaid: 9,
  overdueCount: 2,
  totalRevenue: 14200,
  totalOutstanding: 3800,
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 85 ? '#22c55e' : pct >= 55 ? '#eab308' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', minWidth: 32 }}>{pct}%</span>
    </div>
  )
}

export default function AnalyticsTab() {
  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, color: 'rgba(255,255,255,0.9)' }}>
        Analytics
      </h2>

      {/* Revenue Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        {[
          { label: 'Revenue', value: `$${MOCK_REVENUE.totalRevenue.toLocaleString()}`, color: '#22c55e' },
          { label: 'Outstanding', value: `$${MOCK_REVENUE.totalOutstanding.toLocaleString()}`, color: '#eab308' },
          { label: 'Invoices Sent', value: MOCK_REVENUE.invoicesSent.toString(), color: '#3b82f6' },
          { label: 'Paid', value: MOCK_REVENUE.invoicesPaid.toString(), color: '#22c55e' },
          { label: 'Overdue', value: MOCK_REVENUE.overdueCount.toString(), color: '#ef4444' },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 12,
              padding: 20,
              backdropFilter: 'blur(20px)',
            }}
          >
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: item.color, fontFamily: 'JetBrains Mono, monospace' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Agent Performance */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'rgba(255,255,255,0.8)' }}>
        Agent Performance
      </h3>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 0.8fr 1.2fr 0.8fr 0.8fr',
          padding: '12px 20px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span>Agent</span>
          <span>Runs Today</span>
          <span>Avg Confidence</span>
          <span>Success</span>
          <span>Cost</span>
        </div>
        {MOCK_AGENTS.map((agent) => (
          <div
            key={agent.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 0.8fr 1.2fr 0.8fr 0.8fr',
              padding: '16px 20px',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>{agent.name}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.7)' }}>
              {agent.runsToday}
            </span>
            <ConfidenceBar value={agent.avgConfidence} />
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              color: agent.successRate >= 0.9 ? '#22c55e' : '#eab308',
            }}>
              {Math.round(agent.successRate * 100)}%
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.5)' }}>
              ${agent.tokenCost.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        Data shown is sample data. Connect to agent_runs table for live metrics.
      </p>
    </div>
  )
}

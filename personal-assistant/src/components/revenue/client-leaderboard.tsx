'use client'

import React, { useState, useEffect } from 'react'
import type { ClientRevenueScore, TrendDirection, RiskLevel } from '@/lib/revenue/types'
import { formatCents } from '@/lib/revenue/types'
import { S, C } from '@/lib/styles/design-tokens'

// ─── Visual Config ──────────────────────────────────────────────────────────

const TREND_ICONS: Record<TrendDirection, string> = {
  growing: '\u2191',   // ↑
  stable: '\u2192',    // →
  declining: '\u2193',  // ↓
  new: '\u2605',       // ★
  churned: '\u2717',   // ✗
}

const TREND_COLORS: Record<TrendDirection, string> = {
  growing: 'var(--bb-green)',
  stable: 'var(--text-secondary)',
  declining: 'var(--bb-red)',
  new: 'var(--bb-blue)',
  churned: 'var(--bb-red)',
}

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'var(--bb-green)',
  medium: 'var(--bb-amber)',
  high: 'var(--bb-orange)',
  critical: 'var(--bb-red)',
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-xl)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  overflow: 'hidden',
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr 90px 70px 70px 60px',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  fontSize: 14,
  transition: 'background var(--duration-fast) var(--ease-default)',
  cursor: 'default',
}

const headerRowStyle: React.CSSProperties = {
  ...rowStyle,
  padding: '8px 16px',
  fontSize: 14,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
  background: C.bgHover,
}

const scoreCircleStyle = (score: number): React.CSSProperties => {
  const hue = Math.round((score / 100) * 120) // 0=red, 60=yellow, 120=green
  return {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: `hsla(${hue}, 70%, 45%, 0.15)`,
    color: `hsl(${hue}, 70%, 55%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'var(--font-mono)',
  }
}

const nameStyle: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontWeight: 500,
  fontSize: 14,
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ClientLeaderboardProps {
  clients: ClientRevenueScore[]
  atRisk?: ClientRevenueScore[]
}

export function ClientLeaderboard({ clients, atRisk = [] }: ClientLeaderboardProps) {
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map())
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  // Fetch contact names
  useEffect(() => {
    const ids = [...clients, ...atRisk].map(c => c.contact_id)
    if (ids.length === 0) return

    async function fetchNames() {
      try {
        const params = new URLSearchParams()
        params.set('limit', String(ids.length))
        const res = await fetch(`/api/revenue/clients?${params}`)
        if (res.ok) {
          const json = await res.json()
          const names = new Map<string, string>()
          for (const c of json.clients ?? []) {
            names.set(c.contact_id, c.contact_name ?? 'Unknown')
          }
          setContactNames(names)
        }
      } catch {
        // Non-critical, use fallback
      }
    }

    fetchNames()
  }, [clients, atRisk])

  const allClients = clients

  if (allClients.length === 0) return null

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerRowStyle}>
        <span>Score</span>
        <span>Client</span>
        <span>Revenue</span>
        <span>Trend</span>
        <span>Pays In</span>
        <span>Risk</span>
      </div>

      {/* Rows */}
      {allClients.map(client => {
        const isAtRisk = atRisk.some(r => r.contact_id === client.contact_id)
        const name = contactNames.get(client.contact_id) ?? `Client ${client.contact_id.slice(0, 6)}`
        const isHovered = hoveredRow === client.contact_id

        return (
          <div
            key={client.contact_id}
            style={{
              ...rowStyle,
              background: isHovered ? 'var(--hover-bg-strong)' : isAtRisk ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
            }}
            onMouseEnter={() => setHoveredRow(client.contact_id)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            {/* Score circle */}
            <div style={scoreCircleStyle(client.overall_score ?? client.composite_score ?? 0)}>
              {client.overall_score ?? client.composite_score ?? 0}
            </div>

            {/* Name */}
            <span style={nameStyle}>{name}</span>

            {/* Revenue */}
            <span style={{ ...monoStyle, color: 'var(--text-primary)' }}>
              {formatCents(client.total_revenue_cents)}
            </span>

            {/* Trend */}
            <span style={{ color: TREND_COLORS[client.trend_direction ?? client.trend ?? 'stable'], fontWeight: 500 }}>
              {TREND_ICONS[client.trend_direction ?? client.trend ?? 'stable']} {client.trend_direction ?? client.trend ?? 'stable'}
            </span>

            {/* Avg days to pay */}
            <span style={{ ...monoStyle, color: (client.avg_days_to_pay ?? 0) > 14 ? 'var(--bb-amber)' : 'var(--text-secondary)' }}>
              {client.avg_days_to_pay ?? 0}d
            </span>

            {/* Risk level */}
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: RISK_COLORS[client.risk_level ?? 'low'],
              textTransform: 'uppercase',
            }}>
              {client.risk_level}
            </span>
          </div>
        )
      })}
    </div>
  )
}

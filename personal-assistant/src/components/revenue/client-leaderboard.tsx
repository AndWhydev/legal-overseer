'use client'

import React, { useState, useEffect } from 'react'
import type { ClientRevenueScore, TrendDirection, RiskLevel } from '@/lib/revenue/types'
import { formatCents } from '@/lib/revenue/types'

// ─── Visual Config ──────────────────────────────────────────────────────────

const TREND_ICONS: Record<TrendDirection, string> = {
  growing: '\u2191',   // ↑
  stable: '\u2192',    // →
  declining: '\u2193',  // ↓
  new: '\u2605',       // ★
  churned: '\u2717',   // ✗
}

const TREND_COLORS: Record<TrendDirection, string> = {
  growing: 'text-green-500',
  stable: 'text-muted-foreground',
  declining: 'text-red-500',
  new: 'text-blue-500',
  churned: 'text-red-500',
}

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'text-green-500',
  medium: 'text-amber-500',
  high: 'text-destructive',
  critical: 'text-red-500',
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
    <div className="rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[32px_1fr_90px_70px_70px_60px] items-center gap-2 px-4 py-2 text-sm text-muted-foreground uppercase tracking-wider font-medium bg-muted">
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
        const score = client.overall_score ?? client.composite_score ?? 0
        const hue = Math.round((score / 100) * 120)

        return (
          <div
            key={client.contact_id}
            className={`grid grid-cols-[32px_1fr_90px_70px_70px_60px] items-center gap-2 px-4 py-3 text-sm transition-colors cursor-default ${
              isHovered ? 'bg-accent' : isAtRisk ? 'bg-red-500/[0.04]' : 'bg-transparent'
            }`}
            onMouseEnter={() => setHoveredRow(client.contact_id)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            {/* Score circle */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium font-mono"
              style={{
                background: `hsla(${hue}, 70%, 45%, 0.15)`,
                color: `hsl(${hue}, 70%, 55%)`,
              }}
            >
              {score}
            </div>

            {/* Name */}
            <span className="font-medium text-foreground truncate">{name}</span>

            {/* Revenue */}
            <span className="font-mono font-medium text-sm text-foreground">
              {formatCents(client.total_revenue_cents)}
            </span>

            {/* Trend */}
            <span className={`font-medium text-sm ${TREND_COLORS[client.trend_direction ?? client.trend ?? 'stable']}`}>
              {TREND_ICONS[client.trend_direction ?? client.trend ?? 'stable']} {client.trend_direction ?? client.trend ?? 'stable'}
            </span>

            {/* Avg days to pay */}
            <span className={`font-mono font-medium text-sm ${(client.avg_days_to_pay ?? 0) > 14 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              {client.avg_days_to_pay ?? 0}d
            </span>

            {/* Risk level */}
            <span className={`text-sm font-medium uppercase ${RISK_COLORS[client.risk_level ?? 'low']}`}>
              {client.risk_level}
            </span>
          </div>
        )
      })}
    </div>
  )
}

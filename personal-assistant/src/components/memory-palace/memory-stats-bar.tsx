'use client'

import React from 'react'
import type { MemoryPalaceStats } from '@/lib/memory-palace/types'

interface MemoryStatsBarProps {
  stats: MemoryPalaceStats
}

export function MemoryStatsBar({ stats }: MemoryStatsBarProps) {
  const healthColor = stats.avg_confidence > 0.7 ? '#22C55E' :
    stats.avg_confidence > 0.4 ? '#F59E0B' : '#EF4444'

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '12px 16px',
      background: 'rgba(15, 20, 30, 0.25)',
      backdropFilter: 'blur(8px)',
      borderRadius: '10px',
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      {/* Total Memories */}
      <StatPill
        label="Memories"
        value={String(stats.total_memories)}
        color="#FF7A45"
      />

      {/* Decisions */}
      <StatPill
        label="Decisions"
        value={String(stats.decisions_count)}
        color="#8B5CF6"
      />

      {/* Patterns */}
      <StatPill
        label="Patterns"
        value={String(stats.patterns_count)}
        color="#14B8A6"
      />

      {/* Avg Confidence */}
      <StatPill
        label="Confidence"
        value={`${Math.round(stats.avg_confidence * 100)}%`}
        color={healthColor}
      />

      {/* Needing Decay */}
      {stats.needing_decay > 0 && (
        <StatPill
          label="Pending Decay"
          value={String(stats.needing_decay)}
          color="#F59E0B"
        />
      )}

      {/* Low Confidence Warning */}
      {stats.low_confidence > 0 && (
        <StatPill
          label="Low Confidence"
          value={String(stats.low_confidence)}
          color="#EF4444"
        />
      )}
    </div>
  )
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    }}>
      <span style={{
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: 400,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '14px',
        fontWeight: 700,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

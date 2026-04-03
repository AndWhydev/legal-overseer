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
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-3">
      {/* Total Memories */}
      <StatPill
        label="Memories"
        value={String(stats.total_memories)}
        color="#E2E8F0"
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
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>
      <span
        className="text-sm font-medium tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  )
}

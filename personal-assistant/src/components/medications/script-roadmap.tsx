'use client'

import { useMemo } from 'react'
import { Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getScriptRoadmap, type ScriptRoadmap as ScriptRoadmapType } from '@/lib/medications/inventory'
import { inventoryItems } from '@/lib/medications/inventory-seed'
import { medications, medicationMap } from '@/lib/medications/seed-data'
import type { InventoryItem } from '@/lib/medications/types'

// Estimate daily usage from seed schedule patterns
const estimatedDailyUsage: Record<string, number> = {
  dex: 6,
  escit: 0.14, // ~1/week
  iso: 2,
  clon: 1,
  thea: 2,
  mag: 1,
  astax: 1,
  omega: 2,
  prop: 0.5, // as-needed
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

function TimelineBar({
  roadmap,
  maxDays,
}: {
  roadmap: ScriptRoadmapType
  maxDays: number
}) {
  const stockPct = Math.min(100, (roadmap.daysUntilStockout / maxDays) * 100)
  const today = new Date().toISOString().split('T')[0]

  // Script validity bar (only for prescriptions with expiry)
  let scriptPct = 100
  if (roadmap.scriptExpires) {
    const daysToExpiry = daysBetween(today, roadmap.scriptExpires)
    scriptPct = Math.min(100, Math.max(0, (daysToExpiry / maxDays) * 100))
  }

  const stockColor =
    roadmap.daysUntilStockout < 3
      ? 'bg-destructive'
      : roadmap.daysUntilStockout < 7
        ? 'bg-warning'
        : roadmap.daysUntilStockout < 14
          ? 'bg-warning/70'
          : 'bg-success'

  const hasWarning = roadmap.needsRefill || roadmap.needsNewScript

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{roadmap.name}</span>
          {hasWarning && (
            <AlertTriangle className="h-3 w-3 text-warning" />
          )}
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {roadmap.daysUntilStockout === Infinity ? '---' : `${roadmap.daysUntilStockout}d left`}
        </span>
      </div>

      {/* Stock bar */}
      <div className="h-2 rounded-full bg-elevated overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', stockColor)}
          style={{ width: `${stockPct}%` }}
        />
      </div>

      {/* Script validity bar (only for Rx) */}
      {roadmap.scriptExpires && (
        <div className="h-1 rounded-full bg-elevated/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/40 transition-all duration-500"
            style={{ width: `${scriptPct}%` }}
          />
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {roadmap.daysUntilStockout !== Infinity && (
          <span>Stock out: {roadmap.stockRunsOut}</span>
        )}
        {roadmap.scriptExpires && (
          <span>Script: {roadmap.scriptExpires}</span>
        )}
        {roadmap.repeatsRemaining !== undefined && (
          <span>{roadmap.repeatsRemaining} repeats</span>
        )}
        {roadmap.needsNewScript && (
          <span className="text-destructive font-medium">Needs new script</span>
        )}
      </div>
    </div>
  )
}

export function ScriptRoadmapPanel({ className }: { className?: string }) {
  const roadmaps = useMemo(() => {
    const results: ScriptRoadmapType[] = []
    for (const item of inventoryItems) {
      const med = medicationMap[item.medicationId]
      if (!med) continue
      const daily = estimatedDailyUsage[item.medicationId] ?? 1
      results.push(getScriptRoadmap(item, daily, med))
    }
    // Sort: most urgent first
    results.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
    return results
  }, [])

  // Timeline spans up to 60 days for visual
  const maxDays = 60

  const warnings = roadmaps.filter(r => r.needsRefill || r.needsNewScript)

  return (
    <div className={cn('glass-card rounded-xl p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Script Roadmap</h3>
        </div>
        {warnings.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">
            {warnings.length} need attention
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-2 w-4 rounded-full bg-success" />
          <span>Stock</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1 w-4 rounded-full bg-primary/40" />
          <span>Script validity</span>
        </div>
      </div>

      {/* Timelines */}
      <div className="space-y-4">
        {roadmaps.map(r => (
          <TimelineBar key={r.medicationId} roadmap={r} maxDays={maxDays} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
        Timeline: next {maxDays} days
      </div>
    </div>
  )
}

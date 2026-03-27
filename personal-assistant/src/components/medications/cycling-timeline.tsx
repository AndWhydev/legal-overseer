'use client'

import { useMemo } from 'react'
import type { Protocol, Medication } from '@/lib/medications/types'
import { applyCyclePattern } from '@/lib/medications/protocols'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CyclingTimelineProps {
  protocols: Protocol[]
  medicationMap: Record<string, Medication>
  startDate?: string
  totalDays?: number
}

export function CyclingTimeline({
  protocols,
  medicationMap,
  startDate,
  totalDays = 42, // 6 weeks
}: CyclingTimelineProps) {
  const start = startDate ?? new Date().toISOString().split('T')[0]

  const timelineData = useMemo(() => {
    // Build date labels
    const dates: string[] = []
    const s = new Date(start + 'T00:00:00')
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(s)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split('T')[0])
    }

    // For each protocol with entries, build cycling bars per medication
    const rows: {
      protocolName: string
      medName: string
      medColor: string
      days: boolean[]
    }[] = []

    for (const protocol of protocols) {
      if (!protocol.active) continue

      const cycleDays = applyCyclePattern(protocol, start, totalDays)

      for (const entry of protocol.entries) {
        const med = medicationMap[entry.medicationId]
        if (!med) continue

        rows.push({
          protocolName: protocol.name,
          medName: med.name,
          medColor: med.pillStyle.primaryColor,
          days: cycleDays.map((d) => d.active),
        })
      }
    }

    return { dates, rows }
  }, [protocols, medicationMap, start, totalDays])

  const { dates, rows } = timelineData

  if (rows.length === 0) {
    return (
      <Card className="p-4 text-center text-sm text-muted-foreground">
        No active protocols with cycling patterns
      </Card>
    )
  }

  // Week markers
  const weekStarts: number[] = []
  for (let i = 0; i < totalDays; i += 7) {
    weekStarts.push(i)
  }

  const today = new Date().toISOString().split('T')[0]
  const todayIndex = dates.indexOf(today)

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cycling Timeline</h3>
        <span className="text-xs text-muted-foreground">
          {totalDays} days from {formatShortDate(start)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Week headers */}
          <div className="flex items-center mb-1 pl-[120px]">
            {weekStarts.map((wi) => (
              <div
                key={wi}
                className="text-[10px] text-muted-foreground"
                style={{ width: `${(7 / totalDays) * 100}%` }}
              >
                W{Math.floor(wi / 7) + 1}
              </div>
            ))}
          </div>

          {/* Medication rows */}
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-2 mb-1">
              {/* Label */}
              <div className="w-[112px] shrink-0 truncate text-xs text-muted-foreground" title={row.medName}>
                {row.medName}
              </div>

              {/* Bar */}
              <div className="flex-1 flex gap-px h-5 relative">
                {row.days.map((active, dayIdx) => (
                  <div
                    key={dayIdx}
                    className={cn(
                      'flex-1 rounded-[2px] transition-colors',
                      dayIdx === todayIndex && 'ring-1 ring-primary/60',
                      !active && 'bg-muted/40 opacity-30'
                    )}
                    style={active ? {
                      backgroundColor: row.medColor,
                      opacity: 0.85,
                    } : undefined}
                    title={`${row.medName} — ${dates[dayIdx]} ${active ? '(active)' : '(off)'}`}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Today marker legend */}
          {todayIndex >= 0 && (
            <div className="flex items-center gap-1.5 mt-2 pl-[120px]">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-[10px] text-muted-foreground">Today</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

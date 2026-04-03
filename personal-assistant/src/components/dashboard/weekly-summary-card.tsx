'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { WeeklyOperationsSummary } from '@/lib/intelligence/weekly-operations-summary'

const fetcher = (url: string) => fetch(url).then(r => r.json())

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

export function WeeklySummaryCard() {
  const { data, isLoading } = useSWR<WeeklyOperationsSummary>('/api/dashboard/weekly-summary', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-32 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    )
  }

  const a = data.autonomy

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Weekly Operations</CardTitle>
          <Badge variant={a.autonomyRate >= 80 ? 'default' : a.autonomyRate >= 50 ? 'secondary' : 'destructive'} className="text-xs">
            {a.autonomyRate}% Autonomy
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {new Date(data.period.start).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })} — {new Date(data.period.end).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Autonomy bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{a.totalRuns} runs</span>
            <span>avg confidence {a.avgConfidence}</span>
          </div>
          <ProgressBar value={a.actDecisions} max={a.totalRuns} color="var(--chart-1)" />
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span className="text-emerald-500">{a.actDecisions} auto</span>
            <span className="text-amber-500">{a.askDecisions} ask</span>
            <span className="text-red-400">{a.escalateDecisions} escalate</span>
          </div>
        </div>

        {/* Highlights */}
        {data.highlights.length > 0 && (
          <div className="space-y-1">
            {data.highlights.map((h, i) => (
              <div key={i} className="text-xs text-emerald-500 flex items-start gap-1.5">
                <span className="mt-0.5">+</span> {h}
              </div>
            ))}
          </div>
        )}

        {/* Concerns */}
        {data.concerns.length > 0 && (
          <div className="space-y-1">
            {data.concerns.map((c, i) => (
              <div key={i} className="text-xs text-amber-500 flex items-start gap-1.5">
                <span className="mt-0.5">!</span> {c}
              </div>
            ))}
          </div>
        )}

        {/* Financial one-liner */}
        {data.financial.totalInvoiced > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Invoiced ${data.financial.totalInvoiced.toLocaleString()} · Received ${data.financial.totalReceived.toLocaleString()} · {data.financial.overdue} overdue
          </div>
        )}
      </CardContent>
    </Card>
  )
}

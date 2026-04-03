'use client'

import React from 'react'
import useSWR from 'swr'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  CardAction,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { WeeklyOperationsSummary } from '@/lib/intelligence/weekly-operations-summary'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function WeeklySummaryCard() {
  const { data, isLoading } = useSWR<WeeklyOperationsSummary>('/api/dashboard/weekly-summary', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20 mt-1" />
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </CardFooter>
      </Card>
    )
  }

  const a = data.autonomy
  const period = `${new Date(data.period.start).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })} — ${new Date(data.period.end).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}`

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Weekly Operations</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {a.autonomyRate}%
        </CardTitle>
        <CardAction>
          <Badge variant="outline">Autonomy</Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="w-full">
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-foreground/50 transition-all"
              style={{ width: `${a.autonomyRate}%` }}
            />
          </div>
          <div className="flex gap-3 mt-1.5 text-xs tabular-nums text-muted-foreground">
            <span>{a.actDecisions} auto</span>
            <span className="opacity-60">{a.askDecisions} ask</span>
            <span className="opacity-40">{a.escalateDecisions} esc</span>
          </div>
        </div>
        <div className="line-clamp-1 flex gap-2 font-medium">
          {a.totalRuns} runs · {a.avgConfidence} avg confidence
        </div>
        <div className="text-muted-foreground">
          {period}
        </div>
        {data.highlights.length > 0 && (
          <div className="text-muted-foreground mt-1 space-y-0.5">
            {data.highlights.slice(0, 2).map((h, i) => (
              <div key={i} className="text-xs truncate">+ {h}</div>
            ))}
          </div>
        )}
        {data.concerns.length > 0 && (
          <div className="text-muted-foreground mt-0.5 space-y-0.5">
            {data.concerns.slice(0, 2).map((c, i) => (
              <div key={i} className="text-xs truncate">! {c}</div>
            ))}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

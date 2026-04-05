'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type FeedItem = { time: string; type: string; summary: string; meta?: Record<string, unknown> }

const TYPE_LABELS: Record<string, string> = {
  agent_run: 'Agent',
  message: 'Message',
  email_received: 'Email in',
  email_sent: 'Email out',
  task_created: 'Task',
  invoice_created: 'Invoice',
  contact_created: 'Contact',
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export function ActivityTimeline() {
  const { data, isLoading } = useSWR<{ feed: FeedItem[] }>('/api/dashboard/activity-feed', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Activity</CardTitle>
        <CardDescription className="text-sm">Last 3 days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
              <Skeleton className="h-3 w-8 shrink-0" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))
        ) : (data?.feed ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No recent activity</div>
        ) : (
          (data?.feed ?? []).slice(0, 15).map((item, i) => (
            <div key={i} className="flex gap-3 py-1.5 border-b border-border last:border-0 items-start">
              <span className="text-sm tabular-nums text-muted-foreground shrink-0 w-6 pt-0.5 text-right">{relativeTime(item.time)}</span>
              <span className="text-sm text-muted-foreground shrink-0 w-10 pt-0.5 truncate">{TYPE_LABELS[item.type] || item.type}</span>
              <span className="text-sm text-muted-foreground leading-snug line-clamp-1">{item.summary}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

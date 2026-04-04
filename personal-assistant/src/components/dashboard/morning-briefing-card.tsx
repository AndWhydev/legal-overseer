'use client'

import React from 'react'
import useSWR from 'swr'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface BriefingItem {
  entity: string
  reason: string
  days?: number
}

interface DiscoveryItem {
  entity: string
  relatesTo: string
}

interface MorningBriefing {
  urgent: BriefingItem[]
  followUps: BriefingItem[]
  discoveries: DiscoveryItem[]
  pendingApprovals: number
  generatedAt: string | null
  stale: boolean
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Updated just now'
  if (hours === 1) return 'Updated 1 hour ago'
  if (hours < 24) return `Updated ${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Updated 1 day ago'
  return `Updated ${days} days ago`
}

export function MorningBriefingCard() {
  const { data, isLoading } = useSWR<MorningBriefing>(
    '/api/dashboard/morning-briefing',
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false }
  )

  if (isLoading || !data) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-24 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-3 w-full mt-2" />
          <Skeleton className="h-3 w-3/4 mt-1.5" />
          <Skeleton className="h-3 w-5/6 mt-1.5" />
        </CardContent>
      </Card>
    )
  }

  const isEmpty = !data.urgent.length && !data.followUps.length && !data.discoveries.length && !data.pendingApprovals

  if (isEmpty && !data.generatedAt) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Morning Briefing</CardDescription>
          <CardTitle className="text-lg font-medium">No briefing yet</CardTitle>
        </CardHeader>
        <CardFooter className="text-xs text-muted-foreground">
          Morning briefing generates overnight
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Morning Briefing</CardDescription>
        <CardTitle className="text-lg font-medium">
          {data.urgent.length > 0
            ? `${data.urgent.length} urgent`
            : isEmpty
              ? 'All clear'
              : 'On track'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.urgent.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Urgent
            </div>
            {data.urgent.map((item, i) => (
              <div key={i} className="truncate">
                {item.entity}: {item.reason}
              </div>
            ))}
          </div>
        )}

        {data.followUps.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Follow ups
            </div>
            {data.followUps.map((item, i) => (
              <div key={i} className="truncate">
                {item.entity}{item.days ? ` (${item.days}d)` : ''}: {item.reason}
              </div>
            ))}
          </div>
        )}

        {data.discoveries.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Discoveries
            </div>
            {data.discoveries.map((item, i) => (
              <div key={i} className="truncate">
                New: {item.entity} relates to {item.relatesTo}
              </div>
            ))}
          </div>
        )}

        {data.pendingApprovals > 0 && (
          <div className="text-sm">
            <span className="tabular-nums">{data.pendingApprovals}</span> pending approval{data.pendingApprovals !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>

      {data.stale && data.generatedAt && (
        <CardFooter className="text-xs text-muted-foreground">
          {formatTimeAgo(data.generatedAt)}
        </CardFooter>
      )}
    </Card>
  )
}

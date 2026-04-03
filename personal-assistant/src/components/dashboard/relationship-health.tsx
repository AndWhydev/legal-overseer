'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Contact = { name: string; type: string; daysSince: number; trend: string; tags: string[] }

const TREND_INDICATOR: Record<string, string> = {
  active: 'opacity-90',
  stable: 'opacity-60',
  cooling: 'opacity-35',
  cold: 'opacity-15',
}

export function RelationshipHealth() {
  const { data, isLoading } = useSWR<{ contacts: Contact[] }>('/api/dashboard/relationship-health', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Relationships</CardTitle>
        <CardDescription className="text-xs">Contact health by last interaction</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-border/30 last:border-0">
              <Skeleton className="h-3 w-3 rounded-full shrink-0" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))
        ) : (data?.contacts ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">No contacts</div>
        ) : (
          (data?.contacts ?? []).map((c, i) => (
            <div key={i} className="flex gap-3 py-1.5 border-b border-border/20 last:border-0 items-center">
              <div className={`h-2 w-2 rounded-full bg-foreground shrink-0 ${TREND_INDICATOR[c.trend] || 'opacity-15'}`} />
              <span className="text-xs text-foreground/80 truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">{c.daysSince === 999 ? 'never' : `${c.daysSince}d`}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

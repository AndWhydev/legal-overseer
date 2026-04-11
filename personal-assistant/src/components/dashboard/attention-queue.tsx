'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Attention = { priority: number; label: string; detail: string; type: string; age?: string }

const TYPE_ICON: Record<string, string> = {
  overdue: '!',
  blocked: '!!',
  invoice: '$',
  unanswered: '?',
}

export function AttentionQueue() {
  const { data, isLoading } = useSWR<{ items: Attention[] }>('/api/dashboard/attention-queue', fetcher, {
    refreshInterval: 120_000,
    revalidateOnFocus: false,
  })

  const items = data?.items ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Needs Attention</CardTitle>
          {items.length > 0 && <Badge variant="outline" className="text-base tabular-nums">{items.length}</Badge>}
        </div>
        <CardDescription className="text-base">Prioritised by urgency</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
              <Skeleton className="h-4 w-4 shrink-0" />
              <div className="flex-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3 mt-1" /></div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="text-base text-muted-foreground py-4">Nothing urgent</div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0 items-start">
              <span className="text-base text-muted-foreground tabular-nums shrink-0 w-4 pt-0.5">{TYPE_ICON[item.type] || '·'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-foreground truncate">{item.label}</div>
                <div className="text-base text-muted-foreground truncate">{item.detail}</div>
              </div>
              {item.age && <span className="text-base tabular-nums text-muted-foreground shrink-0 pt-0.5">{item.age}</span>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

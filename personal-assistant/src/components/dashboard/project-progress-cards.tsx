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

const PHASE_OPACITY: Record<string, string> = {
  complete: 'opacity-70',
  active: 'opacity-40',
  blocked: 'opacity-20',
  pending: 'opacity-10',
}

export function ProjectProgressCards() {
  const { data, isLoading } = useSWR<WeeklyOperationsSummary>('/api/dashboard/weekly-summary', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return (
      <>
        {[0, 1].map(i => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-20 mt-1" />
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5">
              <Skeleton className="h-4 w-40" />
            </CardFooter>
          </Card>
        ))}
      </>
    )
  }

  if (data.projects.length === 0) return null

  return (
    <>
      {data.projects.map(project => {
        const allPhases = [
          ...project.phasesCompleted.map(p => ({ title: p, status: 'complete' })),
          ...project.phasesStarted.map(p => ({ title: p, status: 'active' })),
          ...project.blockers.map((b, i) => ({ title: b, status: 'blocked' })),
        ]
        const completedCount = project.phasesCompleted.length
        const totalCount = allPhases.length || 1

        return (
          <Card key={project.name} className="@container/card">
            <CardHeader>
              <CardDescription className="truncate">{project.name}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {completedCount}/{totalCount}
              </CardTitle>
              <CardAction>
                <Badge variant="outline">{project.status}</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              {allPhases.length > 0 && (
                <div className="flex gap-1 w-full">
                  {allPhases.map((phase, i) => (
                    <div
                      key={i}
                      title={phase.title}
                      className={`h-1.5 flex-1 rounded-full bg-foreground ${PHASE_OPACITY[phase.status] || 'opacity-10'}`}
                    />
                  ))}
                </div>
              )}
              {project.nextAction && (
                <div className="line-clamp-1 flex gap-2 font-medium">
                  {project.nextAction}
                </div>
              )}
              {project.blockers.length > 0 && (
                <div className="text-muted-foreground line-clamp-1">
                  Blocked: {project.blockers[0]}
                </div>
              )}
            </CardFooter>
          </Card>
        )
      })}
    </>
  )
}

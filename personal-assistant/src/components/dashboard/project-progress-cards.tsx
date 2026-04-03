'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { WeeklyOperationsSummary } from '@/lib/intelligence/weekly-operations-summary'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const PHASE_OPACITY: Record<string, string> = {
  complete: 'opacity-80',
  active: 'opacity-50',
  blocked: 'opacity-25',
  pending: 'opacity-10',
}

export function ProjectProgressCards() {
  const { data, isLoading } = useSWR<WeeklyOperationsSummary>('/api/dashboard/weekly-summary', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-12 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-12 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (data.projects.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.projects.map(project => {
        const allPhases = [
          ...project.phasesCompleted.map(p => ({ title: p, status: 'complete' })),
          ...project.phasesStarted.map(p => ({ title: p, status: 'active' })),
          ...project.blockers.map((_, i) => ({ title: `Blocker ${i + 1}`, status: 'blocked' })),
        ]

        return (
          <Card key={project.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium truncate">{project.name}</CardTitle>
                <Badge variant="outline" className="text-xs shrink-0 font-mono">{project.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Phase progress — monochrome bars */}
              {allPhases.length > 0 && (
                <div className="flex gap-1">
                  {allPhases.map((phase, i) => (
                    <div
                      key={i}
                      title={phase.title}
                      className={`h-1.5 flex-1 rounded-full bg-foreground ${PHASE_OPACITY[phase.status] || 'opacity-10'}`}
                    />
                  ))}
                </div>
              )}

              {/* Next action */}
              {project.nextAction && (
                <div className="text-xs text-muted-foreground">
                  Next: {project.nextAction}
                </div>
              )}

              {/* Blockers */}
              {project.blockers.length > 0 && (
                <div className="text-xs text-muted-foreground opacity-70">
                  Blocked: {project.blockers[0]}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { WeeklyOperationsSummary } from '@/lib/intelligence/weekly-operations-summary'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  blocked: 'bg-red-500/10 text-red-500 border-red-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

const PHASE_ICONS: Record<string, string> = {
  complete: 'text-emerald-500',
  active: 'text-amber-500',
  blocked: 'text-red-400',
  pending: 'text-muted-foreground',
}

export function ProjectProgressCards() {
  const { data, isLoading } = useSWR<WeeklyOperationsSummary>('/api/dashboard/weekly-summary', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
      </div>
    )
  }

  if (data.projects.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.projects.map(project => {
        const totalPhases = project.phasesCompleted.length + project.phasesStarted.length + project.blockers.length
        const completedCount = project.phasesCompleted.length
        const pct = totalPhases > 0 ? Math.round((completedCount / totalPhases) * 100) : 0

        return (
          <Card key={project.name} className="@container/project">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium truncate">{project.name}</CardTitle>
                <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[project.status] || ''}`}>
                  {project.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Phase progress */}
              <div className="flex gap-1">
                {project.phasesCompleted.map(p => (
                  <div key={p} title={p} className="h-1.5 flex-1 rounded-full bg-emerald-500" />
                ))}
                {project.phasesStarted.map(p => (
                  <div key={p} title={p} className="h-1.5 flex-1 rounded-full bg-amber-500" />
                ))}
                {project.blockers.map((_, i) => (
                  <div key={i} className="h-1.5 flex-1 rounded-full bg-red-400" />
                ))}
              </div>

              {/* Next action */}
              {project.nextAction && (
                <div className="text-xs text-muted-foreground">
                  Next: {project.nextAction}
                </div>
              )}

              {/* Blockers */}
              {project.blockers.length > 0 && (
                <div className="text-xs text-red-400">
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

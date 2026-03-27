'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SwarmRun } from '@/lib/swarm/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  running: 'default',
  paused: 'secondary',
  completed: 'secondary',
  failed: 'destructive',
  cancelled: 'outline',
  rolling_back: 'destructive',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolling_back: 'Rolling Back',
}

interface SwarmListProps {
  onSelectRun?: (runId: string) => void
}

export function SwarmList({ onSelectRun }: SwarmListProps) {
  const [runs, setRuns] = useState<SwarmRun[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      const url = filter ? `/api/swarm?status=${filter}` : '/api/swarm'
      const res = await fetch(url)
      const data = await res.json()
      setRuns(data.runs ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchRuns()
    const interval = setInterval(fetchRuns, 5000)
    return () => clearInterval(interval)
  }, [fetchRuns])

  const formatTime = (iso: string | null) => {
    if (!iso) return '--'
    const d = new Date(iso)
    return d.toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatCost = (cents: number) => {
    if (cents === 0) return '--'
    return `$${(cents / 100).toFixed(2)}`
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-base font-medium text-foreground">
          Agent Swarms
        </h2>
        <div className="flex gap-1.5">
          {[null, 'running', 'completed', 'failed'].map(s => (
            <Button
              key={s ?? 'all'}
              variant={filter === s ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(s)}
              className={filter === s ? '' : 'text-muted-foreground'}
            >
              {s === null ? 'All' : STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Loading swarms...
        </div>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-base text-muted-foreground mb-3">No swarms yet</p>
            <p className="text-sm text-muted-foreground/70 max-w-[300px] mx-auto">
              Trigger a swarm from chat: &quot;Prepare for Thomson pitch&quot; or &quot;Onboard Acme Corp&quot;
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => onSelectRun?.(run.id)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:bg-muted/50 cursor-pointer text-left w-full transition-colors"
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                run.status === 'running' ? 'bg-primary shadow-[0_0_8px_var(--primary)]' :
                run.status === 'completed' ? 'bg-emerald-500' :
                run.status === 'failed' ? 'bg-destructive' :
                run.status === 'pending' ? 'bg-amber-500' :
                'bg-muted-foreground'
              }`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                  {run.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatTime(run.created_at)} · {run.triggered_by}
                </div>
              </div>

              {/* Status badge */}
              <Badge variant={STATUS_VARIANT[run.status] ?? 'outline'}>
                {STATUS_LABELS[run.status] ?? run.status}
              </Badge>

              {/* Cost */}
              <div className="text-xs text-muted-foreground font-mono min-w-[50px] text-right">
                {formatCost(run.total_cost_cents ?? run.total_cost ?? 0)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

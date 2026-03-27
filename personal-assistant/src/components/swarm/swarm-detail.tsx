'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SwarmRun, SwarmStep, SwarmMessage } from '@/lib/swarm/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { IconArrowLeft } from '@tabler/icons-react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
  skipped: 'outline',
  rolled_back: 'destructive',
}

const AGENT_COLORS: Record<string, string> = {
  finance: 'text-emerald-500 bg-emerald-500/10',
  comms: 'text-blue-500 bg-blue-500/10',
  sales: 'text-foreground bg-muted',
  generic: 'text-violet-500 bg-violet-500/10',
}

interface SwarmDetailProps {
  runId: string
  onBack?: () => void
}

export function SwarmDetail({ runId, onBack }: SwarmDetailProps) {
  const [run, setRun] = useState<SwarmRun | null>(null)
  const [steps, setSteps] = useState<SwarmStep[]>([])
  const [messages, setMessages] = useState<SwarmMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/swarm/${runId}`)
      const data = await res.json()
      setRun(data.run)
      setSteps(data.steps ?? [])
      setMessages(data.messages ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    fetchDetail()
    const interval = setInterval(() => {
      if (run?.status === 'executing' || run?.status === 'pending') {
        fetchDetail()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchDetail, run?.status])

  const handleCancel = async () => {
    await fetch(`/api/swarm/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    fetchDetail()
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '--'
    const startMs = new Date(start).getTime()
    const endMs = end ? new Date(end).getTime() : Date.now()
    const durationSec = Math.round((endMs - startMs) / 1000)
    if (durationSec < 60) return `${durationSec}s`
    return `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Loading swarm details...
      </div>
    )
  }

  if (!run) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        Swarm not found
      </div>
    )
  }

  const completedSteps = steps.filter(s => s.status === 'completed').length
  const totalSteps = steps.length
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <IconArrowLeft size={14} />
            Back
          </Button>
        )}
        <div className="flex-1">
          <h2 className="text-base font-medium text-foreground">
            {run.trigger_input}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {run.trigger_type} · {formatDuration(run.started_at, run.completed_at)}
          </p>
        </div>
        {(run.status === 'executing' || run.status === 'pending') && (
          <Button variant="destructive" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {completedSteps}/{totalSteps} steps
            </span>
            <span className="text-sm text-muted-foreground">
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="h-1" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>Cost: ${(run.total_cost / 100).toFixed(2)}</span>
            <span>Tokens: {(run.total_tokens_in + run.total_tokens_out).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Steps timeline */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Execution Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {steps.map((step, i) => (
              <div
                key={step.id}
                className={`flex gap-3 py-3 ${i < steps.length - 1 ? 'border-b border-border' : ''}`}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center w-5 shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    step.status === 'completed' ? 'bg-emerald-500' :
                    step.status === 'failed' ? 'bg-destructive' :
                    step.status === 'executing' ? 'bg-primary shadow-[0_0_8px_var(--primary)]' :
                    'bg-muted-foreground/40'
                  }`} />
                  {i < steps.length - 1 && (
                    <div className="w-0.5 flex-1 bg-border mt-1" />
                  )}
                </div>

                {/* Step info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {step.step_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <Badge
                      variant="secondary"
                      className={AGENT_COLORS[step.agent_type ?? step.agent_role ?? 'generic'] ?? AGENT_COLORS.generic}
                    >
                      {step.agent_type ?? step.agent_role ?? 'agent'}
                    </Badge>
                  </div>

                  {step.error && (
                    <p className="text-xs text-destructive mt-1">{step.error}</p>
                  )}

                  {step.status === 'completed' && step.output && Object.keys(step.output).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer list-none hover:text-foreground">
                        View output
                      </summary>
                      <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-lg mt-1 overflow-auto max-h-[150px]">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                {/* Duration + cost */}
                <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                  <div>{formatDuration(step.started_at, step.completed_at)}</div>
                  {(step.cost_cents ?? 0) > 0 && (
                    <div className="mt-0.5">
                      ${((step.cost_cents ?? 0) / 100).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      {messages.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agent Messages ({messages.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`px-3 py-2 rounded-lg ${
                    msg.message_type === 'conflict' ? 'bg-destructive/5' :
                    msg.message_type === 'resolution' ? 'bg-emerald-500/5' :
                    'bg-muted/50'
                  }`}
                >
                  <div className="flex gap-2 text-xs mb-1">
                    <span className="font-medium text-muted-foreground">
                      {msg.from_step_id}
                    </span>
                    <span className="text-muted-foreground/60">
                      {msg.to_step_id ? `to ${msg.to_step_id}` : 'broadcast'}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {msg.message_type}
                    </Badge>
                  </div>
                  <div className="text-sm text-foreground">
                    {typeof msg.content === 'string'
                      ? msg.content
                      : (msg.content as Record<string, unknown>).summary as string
                        ?? JSON.stringify(msg.content).slice(0, 200)
                    }
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

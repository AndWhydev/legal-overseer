'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { IconShield, IconPlayerPause, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type WatchStatus = 'active' | 'paused'
type WatchType = 'error_keyword' | 'uptime' | 'negative_sentiment'

interface SentryWatch {
  id: string
  watch_type: WatchType
  description: string
  conditions: Record<string, unknown>
  status: WatchStatus
  interval_seconds: number
  escalation_minutes: number
  last_checked_at: string | null
}

interface SentryAlert {
  id: string
  watch_id: string
  status: 'pending' | 'escalated' | 'acknowledged' | 'resolved'
  evidence: string | null
  remediation_suggestion: string | null
  created_at: string
}

interface NewWatchForm {
  watch_type: WatchType
  description: string
  conditions: string
  interval_seconds: number
  escalation_minutes: number
}

const WATCH_LABEL: Record<WatchType, string> = {
  error_keyword: 'Error keyword',
  uptime: 'Uptime',
  negative_sentiment: 'Negative sentiment',
}

const DEFAULT_FORM: NewWatchForm = {
  watch_type: 'error_keyword',
  description: '',
  conditions: '{"keywords":["error","failed"]}',
  interval_seconds: 300,
  escalation_minutes: 15,
}

function toLocalDate(iso: string | null): string {
  if (!iso) return 'Never'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString()
}

export function WatchManager() {
  const [watches, setWatches] = useState<SentryWatch[]>([])
  const [alerts, setAlerts] = useState<SentryAlert[]>([])
  const [form, setForm] = useState<NewWatchForm>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeAlertCount = useMemo(
    () => alerts.filter((alert) => alert.status === 'pending' || alert.status === 'escalated').length,
    [alerts],
  )

  const loadData = useCallback(async () => {
    setErrorMessage(null)
    const [watchRes, alertRes] = await Promise.all([
      fetch('/api/agent/sentry/watches'),
      fetch('/api/agent/sentry/alerts'),
    ])

    if (!watchRes.ok) {
      const watchError = (await watchRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(watchError.error ?? 'Failed to load watches')
    }

    if (!alertRes.ok) {
      const alertError = (await alertRes.json().catch(() => ({}))) as { error?: string }
      throw new Error(alertError.error ?? 'Failed to load alerts')
    }

    const watchBody = (await watchRes.json()) as { watches?: SentryWatch[] }
    const alertBody = (await alertRes.json()) as { alerts?: SentryAlert[] }

    setWatches(watchBody.watches ?? [])
    setAlerts(alertBody.alerts ?? [])
  }, [])

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      try {
        await loadData()
      } catch (error) {
        if (!mounted) return
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load sentry data')
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      mounted = false
    }
  }, [loadData])

  async function refreshAfterMutation(successMessage: string) {
    try {
      await loadData()
      setStatusMessage(successMessage)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Refresh failed after update')
    }
  }

  async function handleCreateWatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatusMessage(null)
    setErrorMessage(null)

    let parsedConditions: Record<string, unknown>
    try {
      parsedConditions = JSON.parse(form.conditions) as Record<string, unknown>
    } catch {
      setIsSubmitting(false)
      setErrorMessage('Conditions must be valid JSON object syntax.')
      return
    }

    try {
      const response = await fetch('/api/agent/sentry/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watch_type: form.watch_type,
          description: form.description,
          conditions: parsedConditions,
          interval_seconds: form.interval_seconds,
          escalation_minutes: form.escalation_minutes,
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to create watch')
      }

      setForm(DEFAULT_FORM)
      await refreshAfterMutation('Watch created.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create watch')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleWatch(watch: SentryWatch) {
    const nextStatus: WatchStatus = watch.status === 'active' ? 'paused' : 'active'
    setStatusMessage(null)
    setErrorMessage(null)
    setWatches((prev) => prev.map((item) => (item.id === watch.id ? { ...item, status: nextStatus } : item)))

    try {
      const response = await fetch('/api/agent/sentry/watches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId: watch.id, status: nextStatus }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to update watch status')
      }

      await refreshAfterMutation(nextStatus === 'active' ? 'Watch resumed.' : 'Watch paused.')
    } catch (error) {
      setWatches((prev) => prev.map((item) => (item.id === watch.id ? { ...item, status: watch.status } : item)))
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update watch')
    }
  }

  async function handleDeleteWatch(watchId: string) {
    setStatusMessage(null)
    setErrorMessage(null)
    const previousWatches = watches
    setWatches((prev) => prev.filter((watch) => watch.id !== watchId))

    try {
      const response = await fetch(`/api/agent/sentry/watches?watchId=${encodeURIComponent(watchId)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to delete watch')
      }

      await refreshAfterMutation('Watch deleted.')
    } catch (error) {
      setWatches(previousWatches)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete watch')
    }
  }

  async function handleAcknowledgeAlert(alertId: string) {
    setStatusMessage(null)
    setErrorMessage(null)
    const previousAlerts = alerts
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId))

    try {
      const response = await fetch('/api/agent/sentry/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge', alertId }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to acknowledge alert')
      }

      await refreshAfterMutation('Alert acknowledged.')
    } catch (error) {
      setAlerts(previousAlerts)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to acknowledge alert')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (errorMessage && watches.length === 0 && alerts.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon"><IconShield size={20} /></EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{errorMessage}</EmptyDescription>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={() => { setIsLoading(true); setErrorMessage(null); loadData().catch((err) => setErrorMessage(err instanceof Error ? err.message : 'Failed to load sentry data')).finally(() => setIsLoading(false)) }}>Retry</Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {statusMessage && (
        <Alert>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="destructive" id="sentry-error" role="alert">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Create Watch */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Create watch</CardTitle>
            <span className="text-sm text-muted-foreground">{watches.length} watches configured</span>
          </div>
        </CardHeader>
        <CardContent>
          <form
            id="sentry-create-watch-form"
            className="grid gap-4 sm:grid-cols-2"
            aria-describedby={errorMessage ? 'sentry-error' : undefined}
            onSubmit={handleCreateWatch}
          >
            <div className="flex flex-col gap-2">
              <Label>Watch type</Label>
              <Select
                value={form.watch_type}
                onValueChange={(val) => setForm((prev) => ({ ...prev, watch_type: val as WatchType }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select watch type" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(WATCH_LABEL) as [WatchType, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="watch-desc">Description</Label>
              <Input
                id="watch-desc"
                required
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Example: monitor failed payment logs"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="watch-conditions">Conditions (JSON)</Label>
              <Textarea
                id="watch-conditions"
                className="font-mono text-sm"
                value={form.conditions}
                onChange={(e) => setForm((prev) => ({ ...prev, conditions: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="watch-interval">Interval seconds</Label>
              <Input
                id="watch-interval"
                type="number"
                min={60}
                max={86400}
                value={form.interval_seconds}
                onChange={(e) => setForm((prev) => ({ ...prev, interval_seconds: Number(e.target.value) || 60 }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="watch-escalation">Escalation minutes</Label>
              <Input
                id="watch-escalation"
                type="number"
                min={1}
                max={1440}
                value={form.escalation_minutes}
                onChange={(e) => setForm((prev) => ({ ...prev, escalation_minutes: Number(e.target.value) || 1 }))}
              />
            </div>
          </form>
          <div className="mt-4 flex justify-end">
            <Button type="submit" form="sentry-create-watch-form" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create watch'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configured Watches */}
      <Card>
        <CardHeader>
          <CardTitle>Configured watches</CardTitle>
        </CardHeader>
        <CardContent>
          {watches.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconShield />
                </EmptyMedia>
                <EmptyTitle>No watches configured</EmptyTitle>
                <EmptyDescription>Create your first watch above to start monitoring for issues.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watches.map((watch) => (
                <Card key={watch.id} className="gap-3 py-4">
                  <CardHeader className="pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                        {WATCH_LABEL[watch.watch_type]}
                      </span>
                      <Badge variant={watch.status === 'active' ? 'default' : 'secondary'}>
                        {watch.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{watch.description}</p>
                    <p className="text-sm text-muted-foreground">
                      Every {watch.interval_seconds}s, escalate after {watch.escalation_minutes}m, last checked{' '}
                      {toLocalDate(watch.last_checked_at)}
                    </p>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm text-muted-foreground">
                      {JSON.stringify(watch.conditions, null, 2)}
                    </pre>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={watch.status === 'active' ? 'Pause watch' : 'Resume watch'}
                        onClick={() => void handleToggleWatch(watch)}
                      >
                        {watch.status === 'active' ? <IconPlayerPause className="size-3.5" /> : <IconPlayerPlay className="size-3.5" />}
                        {watch.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-label={`Delete watch: ${watch.description}`}
                        onClick={() => void handleDeleteWatch(watch.id)}
                      >
                        <IconTrash className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active alerts</CardTitle>
            <span className="text-sm text-muted-foreground">{activeAlertCount} pending/escalated</span>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconShield />
                </EmptyMedia>
                <EmptyTitle>All clear</EmptyTitle>
                <EmptyDescription>
                  Sentry monitors for issues across your channels and alerts you when something needs attention.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map((alert) => (
                <Card key={alert.id} className="gap-3 py-4">
                  <CardHeader className="pb-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                        Alert {alert.id.slice(0, 8)}
                      </span>
                      <Badge variant={alert.status === 'escalated' ? 'destructive' : 'secondary'}>
                        {alert.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">{alert.evidence ?? 'No evidence text provided'}</p>
                    <p className="text-sm text-muted-foreground">Suggested fix: {alert.remediation_suggestion ?? 'None'}</p>
                    <p className="text-sm text-muted-foreground">Created {toLocalDate(alert.created_at)}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleAcknowledgeAlert(alert.id)}
                    >
                      Acknowledge
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

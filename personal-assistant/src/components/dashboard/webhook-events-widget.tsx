'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconChevronDown, IconWebhook } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface WebhookEvent {
  id: string
  org_id: string | null
  source: string
  event_type: string
  external_event_id: string | null
  payload: Record<string, unknown>
  status: 'processing' | 'success' | 'failed' | 'retry'
  response_code: number | null
  error_message: string | null
  retry_count: number
  created_at: string
  processed_at: string | null
}

interface FilterState {
  source: string
  status: string
  event_type: string
  start_date: string
  end_date: string
}

const STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  success: 'default',
  failed: 'destructive',
  processing: 'secondary',
  retry: 'outline',
}

const SOURCE_COLORS: Record<string, string> = {
  stripe: 'bg-indigo-600',
  telnyx: 'bg-gray-800',
  meta: 'bg-blue-600',
  slack: 'bg-sky-500',
  calendly: 'bg-teal-600',
  asana: 'bg-pink-500',
  email: 'bg-indigo-500',
}

export default function WebhookEventsWidget() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    source: '',
    status: '',
    event_type: '',
    start_date: '',
    end_date: '',
  })
  const [total, setTotal] = useState(0)
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.source) params.append('source', filters.source)
      if (filters.status) params.append('status', filters.status)
      if (filters.event_type) params.append('event_type', filters.event_type)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)
      params.append('limit', limit.toString())
      params.append('offset', offset.toString())

      const res = await fetch(`/api/webhooks/events?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch events')

      const data = await res.json()
      setEvents(data.events || [])
      setTotal(data.count || 0)
    } catch (err) {
      console.error('Failed to fetch webhook events:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, limit, offset])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setOffset(0)
  }

  const handleRetry = async (eventId: string) => {
    try {
      const event = events.find((e) => e.id === eventId)
      if (!event) return

      const res = await fetch('/api/webhooks/events/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      })

      if (res.ok) {
        await fetchEvents()
      }
    } catch (err) {
      console.error('Failed to retry event:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-AU', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-6 backdrop-blur-sm">
      <div className="mb-6">
        <h2 className="mb-4 text-base font-medium">Webhook Events</h2>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Select
            value={filters.source || '_all'}
            onValueChange={(v) => handleFilterChange('source', v === '_all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Sources</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="telnyx">Telnyx</SelectItem>
              <SelectItem value="meta">Meta</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="calendly">Calendly</SelectItem>
              <SelectItem value="asana">Asana</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status || '_all'}
            onValueChange={(v) => handleFilterChange('status', v === '_all' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="retry">Retry</SelectItem>
            </SelectContent>
          </Select>

          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => handleFilterChange('start_date', e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Start Date"
          />

          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => handleFilterChange('end_date', e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="End Date"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          Showing {events.length} of {total} events
        </p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading events...</div>
      ) : events.length === 0 ? (
        <Empty className="py-10">
          <EmptyMedia variant="icon"><IconWebhook size={20} /></EmptyMedia>
          <EmptyTitle>No webhook events found</EmptyTitle>
          <EmptyDescription>Webhook events will appear here as they are received.</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="cursor-pointer rounded-lg border border-border/30 bg-card/60 p-3 transition-colors hover:bg-card/80"
              onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3">
                  {/* Source Badge */}
                  <span className={cn(
                    'min-w-[60px] rounded px-2 py-1 text-center text-xs font-medium text-white',
                    SOURCE_COLORS[event.source] || 'bg-gray-500',
                  )}>
                    {event.source.toUpperCase()}
                  </span>

                  {/* Event Type */}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{event.event_type}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(event.created_at)}</div>
                  </div>

                  {/* Status Badge */}
                  <Badge variant={STATUS_VARIANT[event.status] || 'secondary'}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </Badge>
                </div>

                {/* Expand Indicator */}
                <IconChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-muted-foreground transition-transform',
                    expandedId === event.id && 'rotate-180',
                  )}
                />
              </div>

              {/* Expanded Content */}
              {expandedId === event.id && (
                <div className="mt-3 border-t border-border/30 pt-3">
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    {event.external_event_id && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">External ID</div>
                        <div className="mt-1 break-all font-mono text-xs">{event.external_event_id}</div>
                      </div>
                    )}

                    {event.response_code && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Response Code</div>
                        <div className="mt-1 text-xs">{event.response_code}</div>
                      </div>
                    )}

                    {event.retry_count > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Retry Count</div>
                        <div className="mt-1 text-xs">{event.retry_count}</div>
                      </div>
                    )}

                    {event.processed_at && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">Processed</div>
                        <div className="mt-1 text-xs">{formatDate(event.processed_at)}</div>
                      </div>
                    )}
                  </div>

                  {/* Payload */}
                  <div className="mb-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Payload</div>
                    <pre className="m-0 max-h-[200px] overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>

                  {/* Error Message */}
                  {event.error_message && (
                    <div className="mb-3">
                      <div className="mb-2 text-xs font-medium text-muted-foreground">Error</div>
                      <div className="break-words rounded bg-destructive/10 p-2 text-xs text-destructive">
                        {event.error_message}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {event.status === 'failed' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetry(event.id)
                      }}
                    >
                      Retry Event
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="px-3 py-2 text-sm text-muted-foreground">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

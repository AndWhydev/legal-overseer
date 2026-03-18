'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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
        // Refresh events list
        await fetchEvents()
      }
    } catch (err) {
      console.error('Failed to retry event:', err)
    }
  }

  const statusColors: Record<string, string> = {
    success: '#22c55e',
    failed: '#ef4444',
    processing: '#f59e0b',
    retry: '#3b82f6',
  }

  const sourceColors: Record<string, string> = {
    stripe: '#635bff',
    telnyx: '#1f2937',
    meta: '#1877f2',
    slack: '#36c5f0',
    calendly: '#00a699',
    asana: '#f06292',
    email: '#4f46e5',
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
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '12px',
        padding: '24px',
        color: '#1a1a1a',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '500', margin: '0 0 16px 0' }}>Webhook Events</h2>

        {/* Filters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <select
            value={filters.source}
            onChange={(e) => handleFilterChange('source', e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All Sources</option>
            <option value="stripe">Stripe</option>
            <option value="telnyx">Telnyx</option>
            <option value="meta">Meta</option>
            <option value="slack">Slack</option>
            <option value="calendly">Calendly</option>
            <option value="asana">Asana</option>
            <option value="email">Email</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
            <option value="retry">Retry</option>
          </select>

          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => handleFilterChange('start_date', e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
            placeholder="Start Date"
          />

          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => handleFilterChange('end_date', e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
            placeholder="End Date"
          />
        </div>

        <div style={{ fontSize: '14px', color: '#666' }}>
          Showing {events.length} of {total} events
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>Loading events...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>No webhook events found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                background: 'rgba(255, 255, 255, 0.5)',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                borderRadius: '8px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (e.currentTarget instanceof HTMLElement) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)'
                }
              }}
              onMouseLeave={(e) => {
                if (e.currentTarget instanceof HTMLElement) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)'
                }
              }}
              onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  {/* Source Badge */}
                  <div
                    style={{
                      background: sourceColors[event.source] || '#9ca3af',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '500',
                      minWidth: '60px',
                      textAlign: 'center',
                    }}
                  >
                    {event.source.toUpperCase()}
                  </div>

                  {/* Event Type */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{event.event_type}</div>
                    <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{formatDate(event.created_at)}</div>
                  </div>

                  {/* Status Badge */}
                  <div
                    style={{
                      background: statusColors[event.status] || '#9ca3af',
                      color: '#fff',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '500',
                      minWidth: '80px',
                      textAlign: 'center',
                    }}
                  >
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </div>
                </div>

                {/* Expand Indicator */}
                <div
                  style={{
                    fontSize: '16px',
                    transition: 'transform 0.2s ease',
                    transform: expandedId === event.id ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  ▼
                </div>
              </div>

              {/* Expanded Content */}
              {expandedId === event.id && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0, 0, 0, 0.05)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    {event.external_event_id && (
                      <div>
                        <div style={{ fontSize: '14px', color: '#999', fontWeight: '500' }}>External ID</div>
                        <div
                          style={{
                            fontSize: '14px',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                            marginTop: '4px',
                          }}
                        >
                          {event.external_event_id}
                        </div>
                      </div>
                    )}

                    {event.response_code && (
                      <div>
                        <div style={{ fontSize: '14px', color: '#999', fontWeight: '500' }}>Response Code</div>
                        <div style={{ fontSize: '14px', marginTop: '4px' }}>{event.response_code}</div>
                      </div>
                    )}

                    {event.retry_count > 0 && (
                      <div>
                        <div style={{ fontSize: '14px', color: '#999', fontWeight: '500' }}>Retry Count</div>
                        <div style={{ fontSize: '14px', marginTop: '4px' }}>{event.retry_count}</div>
                      </div>
                    )}

                    {event.processed_at && (
                      <div>
                        <div style={{ fontSize: '14px', color: '#999', fontWeight: '500' }}>Processed</div>
                        <div style={{ fontSize: '14px', marginTop: '4px' }}>{formatDate(event.processed_at)}</div>
                      </div>
                    )}
                  </div>

                  {/* Payload */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', color: '#999', fontWeight: '500', marginBottom: '8px' }}>Payload</div>
                    <pre
                      style={{
                        background: 'rgba(0, 0, 0, 0.02)',
                        padding: '8px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        overflow: 'auto',
                        maxHeight: '200px',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  </div>

                  {/* Error Message */}
                  {event.error_message && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '14px', color: '#999', fontWeight: '500', marginBottom: '8px' }}>Error</div>
                      <div
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#dc2626',
                          padding: '8px',
                          borderRadius: '4px',
                          fontSize: '14px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {event.error_message}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {event.status === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetry(event.id)
                      }}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (e.currentTarget instanceof HTMLElement) {
                          e.currentTarget.style.background = '#2563eb'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (e.currentTarget instanceof HTMLElement) {
                          e.currentTarget.style.background = '#3b82f6'
                        }
                      }}
                    >
                      Retry Event
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              background: offset === 0 ? '#f3f4f6' : '#fff',
              cursor: offset === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: offset === 0 ? 0.5 : 1,
            }}
          >
            Previous
          </button>
          <div style={{ padding: '8px 12px', fontSize: '14px', color: '#666' }}>
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </div>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              background: offset + limit >= total ? '#f3f4f6' : '#fff',
              cursor: offset + limit >= total ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: offset + limit >= total ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

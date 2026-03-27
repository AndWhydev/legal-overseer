'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { IconCalendar } from '@tabler/icons-react'
import type { Meeting, MeetingType } from '@/lib/meetings/types'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(234, 179, 8, 0.12)', text: '#eab308' },
  recording: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' },
  transcribing: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6' },
  processing: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6' },
  completed: { bg: 'rgba(34, 197, 94, 0.12)', text: '#22c55e' },
  failed: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444' },
}

const TYPE_LABELS: Record<MeetingType, string> = {
  general: 'General',
  standup: 'Standup',
  client_call: 'Client Call',
  internal: 'Internal',
  sales: 'Sales',
  onboarding: 'Onboarding',
  review: 'Review',
}

interface MeetingListProps {
  onSelectMeeting: (meeting: Meeting) => void
  onUpload: () => void
}

export function MeetingList({ onSelectMeeting, onUpload }: MeetingListProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<MeetingType | ''>('')

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (typeFilter) params.set('meeting_type', typeFilter)

      const res = await fetch(`/api/meetings?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMeetings(data.meetings || [])
        setTotal(data.total || 0)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60)
      return `${hrs}h ${mins % 60}m`
    }
    return `${mins}m ${secs}s`
  }

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '--'
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-foreground">
            Meetings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} meeting{total !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <button
          onClick={onUpload}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Upload Recording
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2">
        {(['', 'client_call', 'standup', 'internal', 'sales', 'review'] as const).map(type => (
          <button
            key={type || 'all'}
            onClick={() => setTypeFilter(type as MeetingType | '')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              typeFilter === type
                ? 'border border-ring bg-secondary text-foreground'
                : 'border border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {type ? TYPE_LABELS[type as MeetingType] : 'All'}
          </button>
        ))}
      </div>

      {/* Meeting rows */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Loading meetings...
          </div>
        ) : meetings.length === 0 ? (
          <Empty className="py-12">
            <EmptyMedia>
              <IconCalendar className="h-6 w-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No upcoming meetings</EmptyTitle>
              <EmptyDescription>
                Connect your calendar and BitBit will show upcoming meetings with context about each attendee.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex gap-2">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Connect calendar
              </button>
              <button
                onClick={onUpload}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
              >
                Upload a recording
              </button>
            </div>
          </Empty>
        ) : (
          <div className="bb-stagger flex flex-col">
            {meetings.map((meeting, i) => {
              const statusColor = STATUS_COLORS[meeting.status] || STATUS_COLORS.pending
              const isHovered = hoveredId === meeting.id
              return (
                <div
                  key={meeting.id}
                  className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors ${
                    isHovered ? 'bg-secondary/50' : 'bg-transparent'
                  } ${i < meetings.length - 1 ? 'border-b border-border' : ''}`}
                  onClick={() => onSelectMeeting(meeting)}
                  onMouseEnter={() => setHoveredId(meeting.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-foreground">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {meeting.title}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {TYPE_LABELS[meeting.meeting_type]} &middot; {formatDuration(meeting.duration_seconds)} &middot; {formatDate(meeting.created_at)}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className="shrink-0 rounded-xl px-3 py-1 text-sm font-medium"
                    style={{ background: statusColor.bg, color: statusColor.text }}
                  >
                    {meeting.status}
                  </span>

                  {/* Sentiment indicator */}
                  {meeting.sentiment_label && (
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: meeting.sentiment_score !== null && meeting.sentiment_score > 0.6
                          ? '#22c55e'
                          : meeting.sentiment_score !== null && meeting.sentiment_score < 0.4
                            ? '#ef4444'
                            : '#eab308',
                      }}
                      title={`Sentiment: ${meeting.sentiment_label}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

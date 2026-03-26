'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { Meeting, MeetingType } from '@/lib/meetings/types'

// ── Styles ──────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
}

const meetingRowStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 12,
  background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary, #F1F5F9)',
            margin: 0,
          }}>
            Meetings
          </h2>
          <p style={{
            fontSize: 14,
            color: 'var(--text-secondary, #94A3B8)',
            margin: '4px 0 0',
          }}>
            {total} meeting{total !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <button
          onClick={onUpload}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            background: 'var(--btn-primary-bg, #F1F5F9)',
            border: 'none',
            color: 'var(--btn-primary-fg, #0a0f1a)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 200ms',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Upload Recording
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(['', 'client_call', 'standup', 'internal', 'sales', 'review'] as const).map(type => (
          <button
            key={type || 'all'}
            onClick={() => setTypeFilter(type as MeetingType | '')}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              background: typeFilter === type ? 'var(--hover-bg-strong)' : 'rgba(10, 14, 23, 0.42)',
              border: typeFilter === type ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(255, 255, 255, 0.06)',
              color: typeFilter === type ? '#E2E8F0' : 'var(--text-secondary, #94A3B8)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 200ms',
            }}
          >
            {type ? TYPE_LABELS[type as MeetingType] : 'All'}
          </button>
        ))}
      </div>

      {/* Meeting rows */}
      <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
            Loading meetings...
          </div>
        ) : meetings.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary, #94A3B8)', fontSize: 14, margin: 0 }}>
              No meetings yet
            </p>
            <p style={{ color: 'var(--text-dim, #475569)', fontSize: 14, margin: '8px 0 0' }}>
              Upload a recording to get started
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {meetings.map((meeting, i) => {
              const statusColor = STATUS_COLORS[meeting.status] || STATUS_COLORS.pending
              const isHovered = hoveredId === meeting.id
              return (
                <div
                  key={meeting.id}
                  style={{
                    ...meetingRowStyle,
                    background: isHovered ? 'var(--hover-bg)' : 'transparent',
                    borderBottom: i < meetings.length - 1 ? '1px solid rgba(255, 255, 255, 0.03)' : 'none',
                    borderRadius: 0,
                    border: 'none',
                    borderBottomWidth: i < meetings.length - 1 ? 1 : 0,
                    borderBottomStyle: 'solid',
                    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
                  }}
                  onClick={() => onSelectMeeting(meeting)}
                  onMouseEnter={() => setHoveredId(meeting.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: 'var(--hover-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#F1F5F9" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                    </svg>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'var(--text-primary, #F1F5F9)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {meeting.title}
                    </div>
                    <div style={{
                      fontSize: 14,
                      color: 'var(--text-dim, #475569)',
                      marginTop: 2,
                    }}>
                      {TYPE_LABELS[meeting.meeting_type]} &middot; {formatDuration(meeting.duration_seconds)} &middot; {formatDate(meeting.created_at)}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    background: statusColor.bg,
                    color: statusColor.text,
                    flexShrink: 0,
                  }}>
                    {meeting.status}
                  </span>

                  {/* Sentiment indicator */}
                  {meeting.sentiment_label && (
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: meeting.sentiment_score !== null && meeting.sentiment_score > 0.6
                        ? '#22c55e'
                        : meeting.sentiment_score !== null && meeting.sentiment_score < 0.4
                          ? '#ef4444'
                          : '#eab308',
                      flexShrink: 0,
                    }} title={`Sentiment: ${meeting.sentiment_label}`} />
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

'use client'

<<<<<<< HEAD
import { useState, useEffect, useCallback } from 'react'
import {
  Mic, Clock, Users, CheckCircle2, AlertCircle,
  Search, Upload, ChevronRight, Loader2,
} from 'lucide-react'
import type { Meeting } from '@/lib/meetings/types'

interface MeetingListProps {
  onSelectMeeting: (id: string) => void
  selectedId?: string
}

const statusConfig: Record<string, { color: string; label: string; icon: typeof Mic }> = {
  uploading: { color: '#F59E0B', label: 'Uploading', icon: Upload },
  uploaded: { color: '#3B82F6', label: 'Uploaded', icon: Clock },
  transcribing: { color: '#8B5CF6', label: 'Transcribing', icon: Loader2 },
  transcribed: { color: '#14B8A6', label: 'Transcribed', icon: Mic },
  processing: { color: '#8B5CF6', label: 'Processing', icon: Loader2 },
  ready: { color: '#22C55E', label: 'Ready', icon: CheckCircle2 },
  failed: { color: '#EF4444', label: 'Failed', icon: AlertCircle },
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-AU', { weekday: 'long' })
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

export function MeetingList({ onSelectMeeting, selectedId }: MeetingListProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
=======
import React, { useState, useEffect, useCallback } from 'react'
import type { Meeting, MeetingType } from '@/lib/meetings/types'

// ── Styles ──────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  padding: '20px',
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
}

const meetingRowStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 12,
  background: 'rgba(10, 14, 23, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
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
>>>>>>> v1.5-marketing-launch

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
<<<<<<< HEAD
      if (search) params.set('search', search)

      const res = await fetch(`/api/meetings?${params}`)
      const data = await res.json()
      setMeetings(data.meetings ?? [])
      setTotal(data.total ?? 0)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [search])
=======
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
>>>>>>> v1.5-marketing-launch

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

<<<<<<< HEAD
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search bar */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
        }}>
          <Search size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search meetings..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              width: '100%',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-dim)' }}>
          {total} meeting{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Meeting list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Loader2 size={20} style={{ color: 'var(--bb-orange)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : meetings.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--text-dim)',
            fontSize: '13px',
          }}>
            <Mic size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>No meetings yet</p>
            <p style={{ fontSize: '11px', marginTop: '4px' }}>Upload a recording to get started</p>
          </div>
        ) : (
          meetings.map(meeting => {
            const status = statusConfig[meeting.status] ?? statusConfig.uploaded
            const StatusIcon = status.icon
            const isSelected = meeting.id === selectedId

            return (
              <button
                key={meeting.id}
                onClick={() => onSelectMeeting(meeting.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px',
                  marginBottom: '4px',
                  background: isSelected ? 'var(--bb-surface-hover)' : 'transparent',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s var(--ease-default)',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bb-surface)'
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                {/* Status indicator */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  background: `${status.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <StatusIcon size={14} style={{ color: status.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {meeting.title}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: 'var(--text-dim)',
                    marginTop: '2px',
                  }}>
                    <span>{formatDate(meeting.created_at)}</span>
                    {meeting.duration_seconds && (
                      <>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={10} />
                          {formatDuration(meeting.duration_seconds)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <ChevronRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              </button>
            )
          })
=======
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
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--text-primary, #F1F5F9)',
            margin: 0,
          }}>
            Meetings
          </h2>
          <p style={{
            fontSize: 13,
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
            borderRadius: 10,
            background: '#FF5A1F',
            border: 'none',
            color: '#000',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 200ms',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
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
              padding: '6px 14px',
              borderRadius: 20,
              background: typeFilter === type ? 'rgba(255, 90, 31, 0.15)' : 'rgba(10, 14, 23, 0.42)',
              border: typeFilter === type ? '1px solid rgba(255, 90, 31, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
              color: typeFilter === type ? '#FF7A45' : 'var(--text-secondary, #94A3B8)',
              fontSize: 12,
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
            <p style={{ color: 'var(--text-dim, #475569)', fontSize: 13, margin: '8px 0 0' }}>
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
                    background: isHovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
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
                    borderRadius: 10,
                    background: 'rgba(255, 90, 31, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#FF5A1F" strokeWidth={1.5}>
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
                      fontSize: 12,
                      color: 'var(--text-dim, #475569)',
                      marginTop: 2,
                    }}>
                      {TYPE_LABELS[meeting.meeting_type]} &middot; {formatDuration(meeting.duration_seconds)} &middot; {formatDate(meeting.created_at)}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
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
>>>>>>> v1.5-marketing-launch
        )}
      </div>
    </div>
  )
}

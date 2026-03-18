'use client'

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

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
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

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

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
        )}
      </div>
    </div>
  )
}

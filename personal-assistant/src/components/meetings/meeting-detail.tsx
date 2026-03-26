'use client'

import React, { useState, useEffect } from 'react'
import type { MeetingWithDetails, MeetingActionItem, MeetingFollowUp, TranscriptSegment } from '@/lib/meetings/types'

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

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: '0 0 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#94a3b8',
}

interface MeetingDetailProps {
  meetingId: string
  onBack: () => void
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps) {
  const [meeting, setMeeting] = useState<MeetingWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript' | 'actions' | 'follow-up'>('transcript')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/meetings/${meetingId}`)
        if (res.ok) {
          const data = await res.json()
          setMeeting(data.meeting)
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [meetingId])

  const handleProcess = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create_tasks: true }),
      })
      if (res.ok) {
        // Reload meeting data
        const reloadRes = await fetch(`/api/meetings/${meetingId}`)
        if (reloadRes.ok) {
          const data = await reloadRes.json()
          setMeeting(data.meeting)
        }
      }
    } catch {
      // silent
    } finally {
      setProcessing(false)
    }
  }

  const handleApproveFollowUp = async (followUpId: string) => {
    try {
      await fetch(`/api/meetings/${meetingId}/follow-ups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follow_up_id: followUpId, action: 'approve' }),
      })
      // Reload
      const res = await fetch(`/api/meetings/${meetingId}`)
      if (res.ok) {
        const data = await res.json()
        setMeeting(data.meeting)
      }
    } catch {
      // silent
    }
  }

  const handleConvertToTasks = async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        // Reload meeting
        const reloadRes = await fetch(`/api/meetings/${meetingId}`)
        if (reloadRes.ok) {
          const meetingData = await reloadRes.json()
          setMeeting(meetingData.meeting)
        }
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim, #475569)' }}>
        Loading meeting...
      </div>
    )
  }

  if (!meeting) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary, #94A3B8)' }}>
        Meeting not found
      </div>
    )
  }

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const tabs = [
    { key: 'transcript' as const, label: 'Transcript', count: meeting.transcript_segments.length },
    { key: 'actions' as const, label: 'Action Items', count: meeting.action_items.length },
    { key: 'follow-up' as const, label: 'Follow-up', count: meeting.follow_ups.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
            color: 'var(--text-secondary, #94A3B8)',
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          &larr; Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary, #F1F5F9)',
            margin: 0,
          }}>
            {meeting.title}
          </h2>
          <p style={{
            fontSize: 14,
            color: 'var(--text-dim, #475569)',
            margin: '2px 0 0',
          }}>
            {meeting.meeting_type} &middot;
            {meeting.duration_seconds ? ` ${Math.floor(meeting.duration_seconds / 60)}m` : ''} &middot;
            {' '}{new Date(meeting.created_at).toLocaleDateString()}
          </p>
        </div>
        {meeting.status === 'pending' && meeting.recording_path && (
          <button
            onClick={handleProcess}
            disabled={processing}
            style={{
              padding: '8px 16px',
              borderRadius: 12,
              background: processing ? 'rgba(255, 255, 255, 0.2)' : '#F1F5F9',
              border: 'none',
              color: 'var(--btn-primary-fg, #0a0f1a)',
              fontSize: 14,
              fontWeight: 500,
              cursor: processing ? 'wait' : 'pointer',
              transition: 'all 200ms',
            }}
          >
            {processing ? 'Processing...' : 'Process Recording'}
          </button>
        )}
      </div>

      {/* Summary card (if completed) */}
      {meeting.summary && (
        <div style={glassCard}>
          <h3 style={sectionTitle}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#F1F5F9" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Summary
          </h3>
          <p style={{
            fontSize: 14,
            color: 'var(--text-primary, #F1F5F9)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            {meeting.summary}
          </p>

          {/* Key decisions */}
          {Array.isArray(meeting.key_decisions) && meeting.key_decisions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ ...sectionTitle, fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
                Key Decisions
              </h4>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {meeting.key_decisions.map((decision, i) => (
                  <li key={i} style={{ fontSize: 14, color: 'var(--text-primary, #F1F5F9)' }}>
                    {decision}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sentiment */}
          {meeting.sentiment_label && (
            <div style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: meeting.sentiment_score !== null && meeting.sentiment_score > 0.6
                  ? '#22c55e'
                  : meeting.sentiment_score !== null && meeting.sentiment_score < 0.4
                    ? '#ef4444'
                    : '#eab308',
              }} />
              <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                Sentiment: {meeting.sentiment_label.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Participants */}
      {meeting.participants.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {meeting.participants.map(p => (
            <span
              key={p.id}
              style={{
                padding: '4px 12px',
                borderRadius: 16,
                background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
                border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                fontSize: 14,
                color: 'var(--text-secondary, #94A3B8)',
              }}
            >
              {p.name}
              {p.role === 'host' && (
                <span style={{ color: '#F1F5F9', marginLeft: 4 }}>host</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1" style={{
        background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
        borderRadius: 12,
        padding: 4,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 8,
              background: activeTab === tab.key ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              color: activeTab === tab.key ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 200ms',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontSize: 14,
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#E2E8F0',
                padding: '0px 8px',
                borderRadius: 8,
                fontWeight: 500,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={glassCard}>
        {activeTab === 'transcript' && (
          <TranscriptView segments={meeting.transcript_segments} />
        )}
        {activeTab === 'actions' && (
          <ActionItemsView
            items={meeting.action_items}
            onConvertToTasks={handleConvertToTasks}
          />
        )}
        {activeTab === 'follow-up' && (
          <FollowUpView
            followUps={meeting.follow_ups}
            onApprove={handleApproveFollowUp}
          />
        )}
      </div>
    </div>
  )
}

// ── Transcript View ─────────────────────────────────────────────────────────

function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim, #475569)', fontSize: 14, margin: 0, textAlign: 'center', padding: 20 }}>
        No transcript available. Process the recording to generate the transcript.
      </p>
    )
  }

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  // Group consecutive segments by speaker
  const grouped: Array<{
    speaker: string | null
    startTime: number
    segments: TranscriptSegment[]
  }> = []

  for (const seg of segments) {
    const last = grouped[grouped.length - 1]
    if (last && last.speaker === seg.speaker_label) {
      last.segments.push(seg)
    } else {
      grouped.push({
        speaker: seg.speaker_label,
        startTime: seg.start_time_ms,
        segments: [seg],
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {grouped.map((group, i) => (
        <div key={i} style={{ display: 'flex', gap: 12 }}>
          {/* Time */}
          <span style={{
            fontSize: 14,
            color: 'var(--text-dim, #475569)',
            fontFamily: 'var(--font-mono, monospace)',
            minWidth: 40,
            paddingTop: 2,
          }}>
            {formatTime(group.startTime)}
          </span>

          {/* Content */}
          <div style={{ flex: 1 }}>
            {group.speaker && (
              <span style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#E2E8F0',
                display: 'block',
                marginBottom: 4,
              }}>
                {group.speaker}
              </span>
            )}
            <p style={{
              fontSize: 14,
              color: 'var(--text-primary, #F1F5F9)',
              lineHeight: 1.6,
              margin: 0,
            }}>
              {group.segments.map(s => s.text).join(' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Action Items View ───────────────────────────────────────────────────────

function ActionItemsView({
  items,
  onConvertToTasks,
}: {
  items: MeetingActionItem[]
  onConvertToTasks: () => void
}) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim, #475569)', fontSize: 14, margin: 0, textAlign: 'center', padding: 20 }}>
        No action items extracted yet.
      </p>
    )
  }

  const pendingCount = items.filter(i => i.status === 'pending' && !i.task_id).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pendingCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onConvertToTasks}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#E2E8F0',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 200ms',
            }}
          >
            Convert {pendingCount} to Kanban Tasks
          </button>
        </div>
      )}

      {items.map(item => (
        <div
          key={item.id}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'var(--bb-surface, rgba(10, 14, 23, 0.4))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="flex items-start gap-3">
            {/* Priority dot */}
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium,
              marginTop: 4,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-primary, #F1F5F9)',
              }}>
                {item.title}
              </div>
              {item.description && (
                <p style={{
                  fontSize: 14,
                  color: 'var(--text-secondary, #94A3B8)',
                  margin: '4px 0 0',
                  lineHeight: 1.5,
                }}>
                  {item.description}
                </p>
              )}
              <div className="flex gap-3 mt-1" style={{ flexWrap: 'wrap' }}>
                {item.assigned_to && (
                  <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                    Assigned: {item.assigned_to}
                  </span>
                )}
                {item.due_date && (
                  <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                    Due: {new Date(item.due_date).toLocaleDateString()}
                  </span>
                )}
                {item.task_id && (
                  <span style={{
                    fontSize: 14,
                    color: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Task created
                  </span>
                )}
              </div>
            </div>
          </div>

          {item.source_quote && (
            <div style={{
              fontSize: 14,
              color: 'var(--text-dim, #475569)',
              fontStyle: 'italic',
              paddingLeft: 20,
              borderLeft: '2px solid rgba(255, 255, 255, 0.12)',
              marginLeft: 8,
            }}>
              &ldquo;{item.source_quote}&rdquo;
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Follow-Up View ──────────────────────────────────────────────────────────

function FollowUpView({
  followUps,
  onApprove,
}: {
  followUps: MeetingFollowUp[]
  onApprove: (id: string) => void
}) {
  if (followUps.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim, #475569)', fontSize: 14, margin: 0, textAlign: 'center', padding: 20 }}>
        No follow-up emails drafted yet.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {followUps.map(fu => (
        <div
          key={fu.id}
          style={{
            padding: '16px',
            borderRadius: 12,
            background: 'var(--bb-surface, rgba(10, 14, 23, 0.4))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              {fu.subject && (
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>
                  {fu.subject}
                </div>
              )}
              {fu.recipient_name && (
                <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', marginTop: 2 }}>
                  To: {fu.recipient_name} {fu.recipient_email && `<${fu.recipient_email}>`}
                </div>
              )}
            </div>
            <span style={{
              padding: '4px 12px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 500,
              background: fu.status === 'approved' ? 'rgba(34, 197, 94, 0.12)' : fu.status === 'sent' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(234, 179, 8, 0.12)',
              color: fu.status === 'approved' ? '#22c55e' : fu.status === 'sent' ? '#3b82f6' : '#eab308',
            }}>
              {fu.status}
            </span>
          </div>

          {/* Body */}
          <div style={{
            fontSize: 14,
            color: 'var(--text-primary, #F1F5F9)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            padding: '12px',
            borderRadius: 8,
            background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
          }}>
            {fu.body}
          </div>

          {/* Actions */}
          {fu.status === 'draft' && (
            <div className="flex gap-2 mt-3 justify-end">
              <button
                onClick={() => onApprove(fu.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: '#22c55e',
                  border: 'none',
                  color: '#000',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                Approve & Send
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

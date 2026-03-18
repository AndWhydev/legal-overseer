'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Mic, Clock, Users, CheckCircle2, AlertCircle, Play,
  FileText, Loader2, ChevronDown, ChevronUp, ArrowLeft,
  ListChecks, Mail, Brain, Search,
} from 'lucide-react'
import type { MeetingWithRelations, TranscriptSegment, MeetingActionItem } from '@/lib/meetings/types'

interface MeetingDetailProps {
  meetingId: string
  onBack: () => void
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}

const sentimentColors: Record<string, string> = {
  positive: '#22C55E',
  neutral: '#6B7280',
  negative: '#EF4444',
  mixed: '#F59E0B',
}

const actionStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(245,158,11,0.1)', text: '#F59E0B' },
  in_progress: { bg: 'rgba(59,130,246,0.1)', text: '#3B82F6' },
  completed: { bg: 'rgba(34,197,94,0.1)', text: '#22C55E' },
  cancelled: { bg: 'rgba(107,114,128,0.1)', text: '#6B7280' },
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps) {
  const [meeting, setMeeting] = useState<MeetingWithRelations | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript' | 'actions' | 'summary'>('summary')
  const [transcriptSearch, setTranscriptSearch] = useState('')

  const fetchMeeting = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}`)
      const data = await res.json()
      setMeeting(data.meeting)
      setSegments(data.segments ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    fetchMeeting()
  }, [fetchMeeting])

  const handleTranscribe = async () => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcribe`, { method: 'POST' })
      if (res.ok) {
        // Refresh meeting data
        await fetchMeeting()
      }
    } catch {
      // ignore
    } finally {
      setProcessing(false)
    }
  }

  const handleCreateTasks = async () => {
    await fetch(`/api/meetings/${meetingId}/actions`, { method: 'POST' })
    await fetchMeeting()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Loader2 size={24} style={{ color: 'var(--bb-orange)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
        Meeting not found
      </div>
    )
  }

  const filteredSegments = transcriptSearch
    ? segments.filter(s => s.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
    : segments

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '4px',
            display: 'flex',
          }}
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ flex: 1 }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {meeting.title}
          </h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '4px',
            fontSize: '12px',
            color: 'var(--text-dim)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} />
              {formatDuration(meeting.duration_seconds)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Users size={11} />
              {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}
            </span>
            {meeting.sentiment_label && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: sentimentColors[meeting.sentiment_label] ?? 'var(--text-dim)',
              }}>
                <Brain size={11} />
                {meeting.sentiment_label}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ListChecks size={11} />
              {meeting.action_items.length} action{meeting.action_items.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Process button */}
        {meeting.status === 'uploaded' && (
          <button
            onClick={handleTranscribe}
            disabled={processing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'var(--bb-orange)',
              color: '#000',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: processing ? 'wait' : 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
            {processing ? 'Processing...' : 'Transcribe'}
          </button>
        )}

        {['transcribing', 'processing'].includes(meeting.status) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: 'rgba(139,92,246,0.1)',
            color: '#8B5CF6',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
          }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Processing...
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 20px',
      }}>
        {(['summary', 'transcript', 'actions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--bb-orange)' : '2px solid transparent',
              cursor: 'pointer',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-dim)',
              fontSize: '13px',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize',
              transition: 'all 0.15s var(--ease-default)',
            }}
          >
            {tab === 'summary' && <FileText size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />}
            {tab === 'transcript' && <Mic size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />}
            {tab === 'actions' && <ListChecks size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />}
            {tab}
            {tab === 'actions' && meeting.action_items.length > 0 && (
              <span style={{
                marginLeft: '6px',
                background: 'var(--bb-orange)',
                color: '#000',
                borderRadius: 'var(--radius-full)',
                padding: '1px 6px',
                fontSize: '10px',
                fontWeight: 700,
              }}>
                {meeting.action_items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {activeTab === 'summary' && <SummaryTab meeting={meeting} />}
        {activeTab === 'transcript' && (
          <TranscriptTab
            segments={filteredSegments}
            search={transcriptSearch}
            onSearchChange={setTranscriptSearch}
            meetingStatus={meeting.status}
          />
        )}
        {activeTab === 'actions' && (
          <ActionsTab
            actionItems={meeting.action_items}
            onCreateTasks={handleCreateTasks}
            meetingId={meetingId}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Summary Tab
// ============================================================================

function SummaryTab({ meeting }: { meeting: MeetingWithRelations }) {
  if (!meeting.summary) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
        No summary available. Transcribe the recording to generate one.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        backdropFilter: 'blur(20px)',
      }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Summary
        </h3>
        <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {meeting.summary}
        </p>
      </div>

      {/* Key Decisions */}
      {meeting.key_decisions && meeting.key_decisions.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          backdropFilter: 'blur(20px)',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Key Decisions
          </h3>
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {meeting.key_decisions.map((decision, i) => (
              <li key={i} style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.5 }}>
                {decision}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Participants */}
      {meeting.participants.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          backdropFilter: 'blur(20px)',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Participants
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {meeting.participants.map(p => (
              <div key={p.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                color: 'var(--text-primary)',
              }}>
                <Users size={11} style={{ color: 'var(--text-dim)' }} />
                {p.display_name}
                {p.role === 'host' && (
                  <span style={{ fontSize: '10px', color: 'var(--bb-orange)' }}>host</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment */}
      {meeting.sentiment_label && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          backdropFilter: 'blur(20px)',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Sentiment
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: sentimentColors[meeting.sentiment_label] ?? 'var(--text-dim)',
            }} />
            <span style={{
              fontSize: '14px',
              color: sentimentColors[meeting.sentiment_label] ?? 'var(--text-primary)',
              textTransform: 'capitalize',
            }}>
              {meeting.sentiment_label}
            </span>
            {meeting.sentiment_score !== null && (
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                ({meeting.sentiment_score > 0 ? '+' : ''}{meeting.sentiment_score.toFixed(2)})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Transcript Tab
// ============================================================================

function TranscriptTab({
  segments,
  search,
  onSearchChange,
  meetingStatus,
}: {
  segments: TranscriptSegment[]
  search: string
  onSearchChange: (s: string) => void
  meetingStatus: string
}) {
  if (!['transcribed', 'processing', 'ready'].includes(meetingStatus)) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
        Transcript not available. Process the recording first.
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-input)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        marginBottom: '16px',
      }}>
        <Search size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search transcript..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
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

      {/* Segments */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {segments.map(seg => {
          const speakerColor = seg.speaker_label === 'Speaker 1' ? 'var(--bb-blue)' : 'var(--bb-purple)'

          return (
            <div
              key={seg.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: seg.is_actionable ? 'rgba(255,90,31,0.05)' : 'transparent',
                borderLeft: seg.is_actionable ? '2px solid var(--bb-orange)' : '2px solid transparent',
              }}
            >
              <span style={{
                fontSize: '11px',
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                minWidth: '48px',
                paddingTop: '2px',
              }}>
                {formatTimestamp(seg.start_seconds)}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: speakerColor,
                whiteSpace: 'nowrap',
                minWidth: '80px',
                paddingTop: '2px',
              }}>
                {seg.speaker_name || seg.speaker_label || 'Unknown'}
              </span>
              <span style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                lineHeight: 1.5,
              }}>
                {seg.text}
              </span>
            </div>
          )
        })}
      </div>

      {segments.length === 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
          {search ? 'No matching segments' : 'No transcript segments'}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Actions Tab
// ============================================================================

function ActionsTab({
  actionItems,
  onCreateTasks,
  meetingId,
}: {
  actionItems: MeetingActionItem[]
  onCreateTasks: () => void
  meetingId: string
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleStatusToggle = async (item: MeetingActionItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    setUpdatingId(item.id)
    try {
      await fetch(`/api/meetings/${meetingId}/actions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_item_id: item.id, status: newStatus }),
      })
      // Optimistic update handled by parent refresh
    } catch {
      // ignore
    } finally {
      setUpdatingId(null)
    }
  }

  if (actionItems.length === 0) {
    return (
      <div style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
        No action items extracted yet.
      </div>
    )
  }

  const pendingItems = actionItems.filter(a => a.status !== 'completed')
  const completedItems = actionItems.filter(a => a.status === 'completed')
  const unlinkedCount = actionItems.filter(a => !a.task_id && a.status === 'pending').length

  return (
    <div>
      {/* Create tasks button */}
      {unlinkedCount > 0 && (
        <button
          onClick={onCreateTasks}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: 'var(--bb-orange)',
            color: '#000',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
          }}
        >
          <ListChecks size={14} />
          Create {unlinkedCount} task{unlinkedCount > 1 ? 's' : ''} on kanban
        </button>
      )}

      {/* Pending items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pendingItems.map(item => (
          <ActionItemCard
            key={item.id}
            item={item}
            onToggle={() => handleStatusToggle(item)}
            updating={updatingId === item.id}
          />
        ))}
      </div>

      {/* Completed items */}
      {completedItems.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>
            Completed ({completedItems.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.6 }}>
            {completedItems.map(item => (
              <ActionItemCard
                key={item.id}
                item={item}
                onToggle={() => handleStatusToggle(item)}
                updating={updatingId === item.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionItemCard({
  item,
  onToggle,
  updating,
}: {
  item: MeetingActionItem
  onToggle: () => void
  updating: boolean
}) {
  const statusStyle = actionStatusColors[item.status] ?? actionStatusColors.pending
  const isCompleted = item.status === 'completed'

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '12px',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-md)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        disabled={updating}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          border: isCompleted ? 'none' : '1.5px solid var(--text-dim)',
          background: isCompleted ? 'var(--bb-green)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '1px',
        }}
      >
        {isCompleted && <CheckCircle2 size={12} style={{ color: '#fff' }} />}
      </button>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          textDecoration: isCompleted ? 'line-through' : 'none',
        }}>
          {item.title}
        </div>

        {item.description && (
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.4 }}>
            {item.description}
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '6px',
          flexWrap: 'wrap',
        }}>
          {item.assignee_name && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(59,130,246,0.1)',
              color: '#3B82F6',
            }}>
              {item.assignee_name}
            </span>
          )}
          {item.due_date_raw && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(245,158,11,0.1)',
              color: '#F59E0B',
            }}>
              {item.due_date_raw}
            </span>
          )}
          {item.task_id && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(34,197,94,0.1)',
              color: '#22C55E',
            }}>
              Linked to task
            </span>
          )}
          {item.confidence !== null && (
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              {Math.round(item.confidence * 100)}% confident
            </span>
          )}
        </div>

        {item.source_text && (
          <div style={{
            fontSize: '11px',
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            marginTop: '6px',
            paddingLeft: '8px',
            borderLeft: '2px solid rgba(255,255,255,0.06)',
            lineHeight: 1.4,
          }}>
            &ldquo;{item.source_text}&rdquo;
          </div>
        )}
      </div>
    </div>
  )
}

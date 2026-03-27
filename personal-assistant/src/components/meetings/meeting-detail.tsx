'use client'

import React, { useState, useEffect } from 'react'
import { IconArrowLeft, IconFileText, IconCheck } from '@tabler/icons-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { MeetingWithDetails, MeetingActionItem, MeetingFollowUp, TranscriptSegment } from '@/lib/meetings/types'

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
      <div className="p-10 text-center text-muted-foreground">
        Loading meeting...
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Meeting not found
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        >
          <IconArrowLeft className="inline h-4 w-4 mr-1" />
          Back
        </button>
        <div className="flex-1">
          <h2 className="text-base font-medium text-foreground">
            {meeting.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {meeting.meeting_type} &middot;
            {meeting.duration_seconds ? ` ${Math.floor(meeting.duration_seconds / 60)}m` : ''} &middot;
            {' '}{new Date(meeting.created_at).toLocaleDateString()}
          </p>
        </div>
        {meeting.status === 'pending' && meeting.recording_path && (
          <button
            onClick={handleProcess}
            disabled={processing}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {processing ? 'Processing...' : 'Process Recording'}
          </button>
        )}
      </div>

      {/* Summary card (if completed) */}
      {meeting.summary && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <IconFileText className="h-4 w-4" />
            Summary
          </h3>
          <p className="text-sm leading-relaxed text-foreground">
            {meeting.summary}
          </p>

          {/* Key decisions */}
          {Array.isArray(meeting.key_decisions) && meeting.key_decisions.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                Key Decisions
              </h4>
              <ul className="flex flex-col gap-2 pl-5">
                {meeting.key_decisions.map((decision, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {decision}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sentiment */}
          {meeting.sentiment_label && (
            <div className="mt-3 flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  background: meeting.sentiment_score !== null && meeting.sentiment_score > 0.6
                    ? '#22c55e'
                    : meeting.sentiment_score !== null && meeting.sentiment_score < 0.4
                      ? '#ef4444'
                      : '#eab308',
                }}
              />
              <span className="text-sm text-muted-foreground">
                Sentiment: {meeting.sentiment_label.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Participants */}
      {meeting.participants.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {meeting.participants.map(p => (
            <Badge key={p.id} variant="secondary">
              {p.name}
              {p.role === 'host' && (
                <span className="ml-1 text-foreground">host</span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="transcript" className="flex-1">
            Transcript
            {meeting.transcript_segments.length > 0 && (
              <Badge variant="secondary" className="ml-2">{meeting.transcript_segments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex-1">
            Action Items
            {meeting.action_items.length > 0 && (
              <Badge variant="secondary" className="ml-2">{meeting.action_items.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="follow-up" className="flex-1">
            Follow-up
            {meeting.follow_ups.length > 0 && (
              <Badge variant="secondary" className="ml-2">{meeting.follow_ups.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <TranscriptView segments={meeting.transcript_segments} />
        </TabsContent>
        <TabsContent value="actions" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <ActionItemsView
            items={meeting.action_items}
            onConvertToTasks={handleConvertToTasks}
          />
        </TabsContent>
        <TabsContent value="follow-up" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <FollowUpView
            followUps={meeting.follow_ups}
            onApprove={handleApproveFollowUp}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// -- Transcript View --

function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  if (segments.length === 0) {
    return (
      <p className="p-5 text-center text-sm text-muted-foreground">
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
    <div className="flex flex-col gap-4">
      {grouped.map((group, i) => (
        <div key={i} className="flex gap-3">
          {/* Time */}
          <span className="min-w-[40px] pt-0.5 font-mono text-sm text-muted-foreground">
            {formatTime(group.startTime)}
          </span>

          {/* Content */}
          <div className="flex-1">
            {group.speaker && (
              <span className="mb-1 block text-sm font-medium text-foreground">
                {group.speaker}
              </span>
            )}
            <p className="text-sm leading-relaxed text-foreground">
              {group.segments.map(s => s.text).join(' ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// -- Action Items View --

function ActionItemsView({
  items,
  onConvertToTasks,
}: {
  items: MeetingActionItem[]
  onConvertToTasks: () => void
}) {
  if (items.length === 0) {
    return (
      <p className="p-5 text-center text-sm text-muted-foreground">
        No action items extracted yet.
      </p>
    )
  }

  const pendingCount = items.filter(i => i.status === 'pending' && !i.task_id).length

  return (
    <div className="flex flex-col gap-3">
      {pendingCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onConvertToTasks}
            className="rounded-lg border border-ring bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            Convert {pendingCount} to Kanban Tasks
          </button>
        </div>
      )}

      {items.map(item => (
        <div
          key={item.id}
          className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            {/* Priority dot */}
            <div
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ background: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium }}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                {item.title}
              </div>
              {item.description && (
                <p className="mt-1 text-sm leading-normal text-muted-foreground">
                  {item.description}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-3">
                {item.assigned_to && (
                  <span className="text-sm text-muted-foreground">
                    Assigned: {item.assigned_to}
                  </span>
                )}
                {item.due_date && (
                  <span className="text-sm text-muted-foreground">
                    Due: {new Date(item.due_date).toLocaleDateString()}
                  </span>
                )}
                {item.task_id && (
                  <span className="flex items-center gap-1 text-sm text-green-500">
                    <IconCheck className="h-3 w-3" />
                    Task created
                  </span>
                )}
              </div>
            </div>
          </div>

          {item.source_quote && (
            <div className="ml-2 border-l-2 border-border pl-5 text-sm italic text-muted-foreground">
              &ldquo;{item.source_quote}&rdquo;
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// -- Follow-Up View --

function FollowUpView({
  followUps,
  onApprove,
}: {
  followUps: MeetingFollowUp[]
  onApprove: (id: string) => void
}) {
  if (followUps.length === 0) {
    return (
      <p className="p-5 text-center text-sm text-muted-foreground">
        No follow-up emails drafted yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {followUps.map(fu => (
        <div
          key={fu.id}
          className="rounded-xl border border-border bg-secondary/30 p-4"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div>
              {fu.subject && (
                <div className="text-sm font-medium text-foreground">
                  {fu.subject}
                </div>
              )}
              {fu.recipient_name && (
                <div className="mt-0.5 text-sm text-muted-foreground">
                  To: {fu.recipient_name} {fu.recipient_email && `<${fu.recipient_email}>`}
                </div>
              )}
            </div>
            <Badge
              variant={fu.status === 'approved' ? 'default' : fu.status === 'sent' ? 'secondary' : 'outline'}
            >
              {fu.status}
            </Badge>
          </div>

          {/* Body */}
          <div className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm leading-relaxed text-foreground">
            {fu.body}
          </div>

          {/* Actions */}
          {fu.status === 'draft' && (
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => onApprove(fu.id)}
                className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400"
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

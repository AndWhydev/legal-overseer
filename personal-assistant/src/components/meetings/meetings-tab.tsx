'use client'

import React, { useState } from 'react'
import { MeetingList } from './meeting-list'
import { MeetingDetail } from './meeting-detail'
import { MeetingSearch } from './meeting-search'
import { UploadModal } from './upload-modal'
import type { Meeting } from '@/lib/meetings/types'

type View = 'list' | 'detail' | 'search'

interface MeetingsTabProps {
  /** Optional: pre-select a meeting to display */
  initialMeetingId?: string
}

export function MeetingsTab({ initialMeetingId }: MeetingsTabProps) {
  const [view, setView] = useState<View>(initialMeetingId ? 'detail' : 'list')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(initialMeetingId || null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<'meetings' | 'search'>('meetings')

  const handleSelectMeeting = (meeting: Meeting) => {
    setSelectedMeetingId(meeting.id)
    setView('detail')
  }

  const handleSelectMeetingById = (meetingId: string) => {
    setSelectedMeetingId(meetingId)
    setView('detail')
  }

  const handleBack = () => {
    setSelectedMeetingId(null)
    setView('list')
  }

  const handleUploadComplete = (meetingId: string) => {
    setUploadOpen(false)
    setSelectedMeetingId(meetingId)
    setView('detail')
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Section toggle (only visible when not in detail view) */}
      {view !== 'detail' && (
        <div className="flex self-start gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => { setActiveSection('meetings'); setView('list') }}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-none px-4 py-2 text-sm font-medium transition-all ${activeSection === 'meetings' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground'}`}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            Meetings
          </button>
          <button
            onClick={() => { setActiveSection('search'); setView('search') }}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-none px-4 py-2 text-sm font-medium transition-all ${activeSection === 'search' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground'}`}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search Transcripts
          </button>
        </div>
      )}

      {/* Content */}
      {view === 'list' && (
        <MeetingList
          onSelectMeeting={handleSelectMeeting}
          onUpload={() => setUploadOpen(true)}
        />
      )}
      {view === 'detail' && selectedMeetingId && (
        <MeetingDetail
          meetingId={selectedMeetingId}
          onBack={handleBack}
        />
      )}
      {view === 'search' && (
        <MeetingSearch onSelectMeeting={handleSelectMeetingById} />
      )}

      {/* Upload modal */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  )
}

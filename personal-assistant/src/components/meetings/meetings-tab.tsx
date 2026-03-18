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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Section toggle (only visible when not in detail view) */}
      {view !== 'detail' && (
        <div className="flex gap-1" style={{
          background: 'rgba(10, 14, 23, 0.5)',
          borderRadius: 12,
          padding: 4,
          alignSelf: 'flex-start',
        }}>
          <button
            onClick={() => { setActiveSection('meetings'); setView('list') }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: activeSection === 'meetings' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              color: activeSection === 'meetings' ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 200ms',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            Meetings
          </button>
          <button
            onClick={() => { setActiveSection('search'); setView('search') }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: activeSection === 'search' ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
              border: 'none',
              color: activeSection === 'search' ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 200ms',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
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

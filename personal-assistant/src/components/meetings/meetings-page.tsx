'use client'

import { useState } from 'react'
import { Plus, Mic } from 'lucide-react'
import { MeetingList } from './meeting-list'
import { MeetingDetail } from './meeting-detail'
import { MeetingUpload } from './meeting-upload'

export function MeetingsPage() {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleUploaded = (meetingId: string) => {
    setShowUpload(false)
    setSelectedMeetingId(meetingId)
    setRefreshKey(k => k + 1)
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Left panel — Meeting list */}
      <div style={{
        width: '340px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Header with upload button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mic size={16} style={{ color: 'var(--bb-orange)' }} />
            <h1 style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}>
              Meetings
            </h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              background: 'var(--bb-orange)',
              color: '#000',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Plus size={14} />
            Upload
          </button>
        </div>

        <MeetingList
          key={refreshKey}
          onSelectMeeting={setSelectedMeetingId}
          selectedId={selectedMeetingId ?? undefined}
        />
      </div>

      {/* Right panel — Meeting detail */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {selectedMeetingId ? (
          <MeetingDetail
            key={selectedMeetingId}
            meetingId={selectedMeetingId}
            onBack={() => setSelectedMeetingId(null)}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-dim)',
            gap: '12px',
          }}>
            <Mic size={48} style={{ opacity: 0.15 }} />
            <p style={{ fontSize: '14px' }}>Select a meeting or upload a recording</p>
            <p style={{ fontSize: '12px', opacity: 0.6 }}>
              Upload recordings to auto-transcribe, extract action items, and generate summaries
            </p>
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <MeetingUpload
          onUploaded={handleUploaded}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}

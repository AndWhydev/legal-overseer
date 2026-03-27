'use client'

import { useState } from 'react'
import { IconPlus, IconMicrophone } from '@tabler/icons-react'
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
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left panel -- Meeting list */}
      <div className="flex w-[340px] shrink-0 flex-col border-r border-border">
        {/* Header with upload button */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <IconMicrophone className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-medium text-foreground">
              Meetings
            </h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <IconPlus className="h-3.5 w-3.5" />
            Upload
          </button>
        </div>

        <MeetingList
          onSelectMeeting={(m: import('@/lib/meetings/types').Meeting) => setSelectedMeetingId(m.id)}
          onUpload={() => setShowUpload(true)}
        />
      </div>

      {/* Right panel -- Meeting detail */}
      <div className="flex-1 overflow-hidden">
        {selectedMeetingId ? (
          <MeetingDetail
            key={selectedMeetingId}
            meetingId={selectedMeetingId}
            onBack={() => setSelectedMeetingId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <IconMicrophone className="h-12 w-12 opacity-15" />
            <p className="text-sm">Select a meeting or upload a recording</p>
            <p className="text-sm opacity-60">
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

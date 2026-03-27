'use client'

import { useState, useRef, useCallback } from 'react'
import { IconUpload, IconX, IconLoader2, IconFileMusic } from '@tabler/icons-react'
import { ALLOWED_MIME_TYPES, MAX_RECORDING_SIZE } from '@/lib/meetings/types'

interface MeetingUploadProps {
  onUploaded: (meetingId: string) => void
  onCancel: () => void
}

export function MeetingUpload({ onUploaded, onCancel }: MeetingUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [participants, setParticipants] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null)

    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type) && !selectedFile.name.match(/\.(mp3|wav|m4a|mp4|webm|ogg|flac|mov)$/i)) {
      setError('Unsupported file format. Use MP3, WAV, M4A, MP4, WebM, OGG, or FLAC.')
      return
    }

    if (selectedFile.size > MAX_RECORDING_SIZE) {
      setError(`File too large (${(selectedFile.size / (1024 * 1024)).toFixed(0)}MB). Maximum is 500MB.`)
      return
    }

    setFile(selectedFile)
    if (!title) {
      // Auto-generate title from filename
      const name = selectedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
      setTitle(name)
    }
  }, [title])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }, [handleFileSelect])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title || 'Untitled Meeting')

      if (participants.trim()) {
        const names = participants.split(',').map(n => n.trim()).filter(Boolean)
        formData.append('participants', JSON.stringify(names.map(n => ({ display_name: n }))))
      }

      const res = await fetch('/api/meetings', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }

      const data = await res.json()
      onUploaded(data.meeting.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-2xl bg-card p-6 shadow-2xl backdrop-blur-[40px]">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">
            Upload Meeting Recording
          </h2>
          <button
            onClick={onCancel}
            className="rounded-md bg-transparent p-1 text-muted-foreground hover:text-foreground"
          >
            <IconX className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? 'border-foreground bg-secondary/50'
              : 'border-border bg-transparent'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
          />

          {file ? (
            <div>
              <IconFileMusic className="mx-auto mb-2 h-8 w-8 text-foreground" />
              <div className="text-sm font-medium text-foreground">
                {file.name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)}MB
              </div>
            </div>
          ) : (
            <div>
              <IconUpload className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-50" />
              <div className="text-sm text-muted-foreground">
                Drop audio/video file here or click to browse
              </div>
              <div className="mt-1 text-sm text-muted-foreground/70">
                MP3, WAV, M4A, MP4, WebM, OGG, FLAC (max 500MB)
              </div>
            </div>
          )}
        </div>

        {/* Title input */}
        <div className="mb-3">
          <label className="mb-1 block text-sm text-muted-foreground">
            Meeting Title
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Client Strategy Meeting"
            className="w-full rounded-lg border-none bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Participants input */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-muted-foreground">
            Participants (comma-separated, optional)
          </label>
          <input
            type="text"
            value={participants}
            onChange={e => setParticipants(e.target.value)}
            placeholder="e.g., Andy, Sarah, Mike"
            className="w-full rounded-lg border-none bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg bg-secondary px-4 py-2 text-sm text-muted-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <IconUpload className="h-3.5 w-3.5" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

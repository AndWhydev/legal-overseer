'use client'

import React, { useState, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MeetingType } from '@/lib/meetings/types'

const MEETING_TYPES: Array<{ value: MeetingType; label: string }> = [
  { value: 'client_call', label: 'Client Call' },
  { value: 'standup', label: 'Standup' },
  { value: 'internal', label: 'Internal' },
  { value: 'sales', label: 'Sales' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'review', label: 'Review' },
  { value: 'general', label: 'General' },
]

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploadComplete: (meetingId: string) => void
}

export function UploadModal({ open, onClose, onUploadComplete }: UploadModalProps) {
  const [title, setTitle] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType>('client_call')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [participants, setParticipants] = useState<Array<{ name: string; email: string }>>([])
  const [newParticipant, setNewParticipant] = useState({ name: '', email: '' })
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  if (!open) return null

  const handleFileSelect = (f: File) => {
    // Auto-fill title from filename if empty
    if (!title) {
      const name = f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      setTitle(name)
    }
    setFile(f)
    setError('')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  const handleAddParticipant = () => {
    if (newParticipant.name.trim()) {
      setParticipants([...participants, { name: newParticipant.name.trim(), email: newParticipant.email.trim() }])
      setNewParticipant({ name: '', email: '' })
    }
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError('Title and file are required')
      return
    }

    setUploading(true)
    setUploadProgress('Uploading recording...')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title.trim())
      formData.append('meeting_type', meetingType)
      if (description.trim()) formData.append('description', description.trim())
      if (participants.length > 0) {
        formData.append('participants', JSON.stringify(participants))
      }

      const res = await fetch('/api/meetings/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()

      // Start processing
      setUploadProgress('Processing: Transcribing...')
      const processRes = await fetch(`/api/meetings/${data.meeting_id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create_tasks: true }),
      })

      if (processRes.ok) {
        setUploadProgress('Complete!')
        onUploadComplete(data.meeting_id)
      } else {
        // Upload succeeded but processing failed -- still navigate
        onUploadComplete(data.meeting_id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-auto rounded-xl border border-border bg-card p-6 shadow-lg">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">
            Upload Meeting Recording
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-transparent text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 cursor-pointer rounded-xl border-2 border-dashed transition-colors ${
            dragOver
              ? 'border-foreground bg-secondary/50'
              : 'border-border bg-background'
          } ${file ? 'p-4' : 'px-5 py-10'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
          />
          {file ? (
            <div className="flex items-center gap-3">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-foreground">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">
                  {file.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatFileSize(file.size)} &middot; {file.type || 'audio'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="text-center">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-3 text-muted-foreground">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mb-1 text-sm text-muted-foreground">
                Drop audio or video file here
              </p>
              <p className="text-sm text-muted-foreground/70">
                MP3, WAV, M4A, OGG, MP4, WebM (up to 500MB)
              </p>
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Meeting Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Client Review -- AWU Homepage"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Meeting Type</label>
            <Select value={meetingType} onValueChange={v => setMeetingType(v as MeetingType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context about the meeting..."
              className="min-h-[60px] w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>

          {/* Participants */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Participants (optional)</label>
            {participants.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {participants.map((p, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-sm text-muted-foreground"
                  >
                    {p.name}
                    <button
                      onClick={() => handleRemoveParticipant(i)}
                      className="text-sm leading-none text-muted-foreground hover:text-foreground"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newParticipant.name}
                onChange={(e) => setNewParticipant(p => ({ ...p, name: e.target.value }))}
                placeholder="Name"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddParticipant() }}
              />
              <input
                value={newParticipant.email}
                onChange={(e) => setNewParticipant(p => ({ ...p, email: e.target.value }))}
                placeholder="Email (optional)"
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddParticipant() }}
              />
              <button
                onClick={handleAddParticipant}
                className="rounded-xl border border-border bg-transparent px-3 text-base text-muted-foreground hover:text-foreground"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Progress */}
        {uploading && uploadProgress && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-500">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
            {uploadProgress}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={uploading}
            className="rounded-xl border border-border bg-transparent px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !title.trim()}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>
    </div>
  )
}

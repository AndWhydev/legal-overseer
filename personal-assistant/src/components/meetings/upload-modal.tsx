'use client'

import React, { useState, useRef } from 'react'
import { GlassDropdown } from '@/components/ui/glass-dropdown'
import type { MeetingType, ParticipantRole } from '@/lib/meetings/types'
import { S, C } from '@/lib/styles/design-tokens'

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
        // Upload succeeded but processing failed — still navigate
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
    color: 'var(--text-primary, #F1F5F9)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 200ms',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-secondary, #94A3B8)',
    marginBottom: 8,
    display: 'block',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.bgOverlay,
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '24px',
        borderRadius: 20,
        background: 'var(--glass-bg-heavy, rgba(12, 16, 24, 0.85))',
        border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
        boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', margin: 0 }}>
            Upload Meeting Recording
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
              color: 'var(--text-dim, #475569)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
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
          style={{
            padding: file ? '16px' : '40px 20px',
            borderRadius: 12,
            border: `2px dashed ${dragOver ? '#F1F5F9' : C.bgHoverStrong}`,
            background: dragOver ? 'var(--hover-bg)' : C.bgInput,
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 200ms',
            marginBottom: 16,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
          />
          {file ? (
            <div className="flex items-center gap-3">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#F1F5F9" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 14, color: 'var(--text-primary, #F1F5F9)', fontWeight: 500 }}>
                  {file.name}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>
                  {formatFileSize(file.size)} &middot; {file.type || 'audio'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                  color: 'var(--text-dim, #475569)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="var(--text-dim, #475569)" strokeWidth={1.5} style={{ margin: '0 auto 12px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', margin: '0 0 4px' }}>
                Drop audio or video file here
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-dim, #475569)', margin: 0 }}>
                MP3, WAV, M4A, OGG, MP4, WebM (up to 500MB)
              </p>
            </>
          )}
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Meeting Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Client Review — AWU Homepage"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Meeting Type</label>
            <GlassDropdown
              options={MEETING_TYPES.map(t => ({ value: t.value, label: t.label }))}
              value={meetingType}
              onChange={v => setMeetingType(v as MeetingType)}
            />
          </div>

          <div>
            <label style={labelStyle}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context about the meeting..."
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
            />
          </div>

          {/* Participants */}
          <div>
            <label style={labelStyle}>Participants (optional)</label>
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {participants.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 16,
                      background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
                      border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                      fontSize: 14,
                      color: 'var(--text-secondary, #94A3B8)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {p.name}
                    <button
                      onClick={() => handleRemoveParticipant(i)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim, #475569)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                      }}
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
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddParticipant() }}
              />
              <input
                value={newParticipant.email}
                onChange={(e) => setNewParticipant(p => ({ ...p, email: e.target.value }))}
                placeholder="Email (optional)"
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddParticipant() }}
              />
              <button
                onClick={handleAddParticipant}
                style={{
                  padding: '0 12px',
                  borderRadius: 12,
                  background: 'transparent',
                  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
                  color: 'var(--text-secondary, #94A3B8)',
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 12,
            padding: '12px 16px',
            borderRadius: 12,
            background: C.statusErrorBg,
            border: `1px solid ${C.statusError}`,
            fontSize: 14,
            color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        {/* Progress */}
        {uploading && uploadProgress && (
          <div style={{
            marginTop: 12,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(59, 130, 246, 0.1)',
            border: `1px solid rgba(59, 130, 246, 0.2)`,
            fontSize: 14,
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(59, 130, 246, 0.3)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            {uploadProgress}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5 justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              background: 'transparent',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
              color: 'var(--text-secondary, #94A3B8)',
              fontSize: 14,
              fontWeight: 500,
              cursor: uploading ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !title.trim()}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              background: (!file || !title.trim() || uploading) ? C.bgHoverStrong : '#F1F5F9',
              border: 'none',
              color: (!file || !title.trim() || uploading) ? 'rgba(0, 0, 0, 0.5)' : '#0a0f1a',
              fontSize: 14,
              fontWeight: 500,
              cursor: (!file || !title.trim() || uploading) ? 'not-allowed' : 'pointer',
              transition: 'all 200ms',
            }}
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>
    </div>
  )
}

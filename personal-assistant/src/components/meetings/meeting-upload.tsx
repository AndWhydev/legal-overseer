'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, Mic, Loader2, FileAudio } from 'lucide-react'
import { ALLOWED_MIME_TYPES, MAX_RECORDING_SIZE } from '@/lib/meetings/types'
import { S, C } from '@/lib/styles/design-tokens'

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
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-overlay)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-xl)',
        padding: '24px',
        width: '100%',
        maxWidth: '480px',
        backdropFilter: 'blur(40px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Upload Meeting Recording
          </h2>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--text-primary, #F1F5F9)' : C.borderHover}`,
            borderRadius: 'var(--radius-lg)',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--hover-bg)' : 'transparent',
            transition: 'all 0.15s var(--ease-default)',
            marginBottom: '16px',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
          />

          {file ? (
            <div>
              <FileAudio size={32} style={{ color: 'var(--text-primary, #F1F5F9)', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                {file.name}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px' }}>
                {(file.size / (1024 * 1024)).toFixed(1)}MB
              </div>
            </div>
          ) : (
            <div>
              <Upload size={32} style={{ color: 'var(--text-dim)', margin: '0 auto 8px', opacity: 0.5 }} />
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Drop audio/video file here or click to browse
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px' }}>
                MP3, WAV, M4A, MP4, WebM, OGG, FLAC (max 500MB)
              </div>
            </div>
          )}
        </div>

        {/* Title input */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '4px', display: 'block' }}>
            Meeting Title
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Client Strategy Meeting"
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-input)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Participants input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '4px', display: 'block' }}>
            Participants (comma-separated, optional)
          </label>
          <input
            type="text"
            value={participants}
            onChange={e => setParticipants(e.target.value)}
            placeholder="e.g., Andy, Sarah, Mike"
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-input)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            fontSize: '14px',
            color: 'var(--bb-red)',
            marginBottom: '12px',
            padding: '8px',
            background: C.statusErrorBg,
            borderRadius: 'var(--radius-sm)',
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              background: !file || uploading ? 'rgba(255,255,255,0.12)' : '#F1F5F9',
              color: 'var(--btn-primary-fg, #0a0f1a)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: !file || uploading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

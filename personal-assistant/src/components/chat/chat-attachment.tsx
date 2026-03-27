'use client'

import React, { useState, useCallback } from 'react'
import { FileText, File, ImageOff, Download, ExternalLink } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatAttachmentProps {
  type: string       // MIME type
  name: string       // filename
  url: string        // storage_path (NOT a signed URL)
  size?: number      // file size in bytes
  attachmentId?: string  // if available, use /api/attachments/:id for download URL
}

export interface ChatAttachmentListProps {
  attachments: Array<{ type: string; url: string; name: string; size?: number; attachmentId?: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateFilename(name: string, max = 30): string {
  if (name.length <= max) return name
  const ext = name.lastIndexOf('.')
  if (ext === -1) return name.slice(0, max - 3) + '...'
  const extension = name.slice(ext)
  const base = name.slice(0, ext)
  const available = max - extension.length - 3
  if (available <= 0) return name.slice(0, max - 3) + '...'
  return base.slice(0, available) + '...' + extension
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Fetch a signed download URL from the attachments API */
async function fetchSignedUrl(attachmentId: string): Promise<{ signedUrl: string; filename: string; mimeType: string; size: number } | null> {
  try {
    const res = await fetch(`/api/attachments/${attachmentId}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const fileCardStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 12,
  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  cursor: 'pointer',
  transition: 'all 200ms ease',
  maxWidth: 320,
  textDecoration: 'none',
}

const fileCardHoverStyle: React.CSSProperties = {
  ...fileCardStyle,
  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.1))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
}

const filenameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const fileSizeStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim, #475569)',
  marginTop: 1,
}

const downloadLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary, #94A3B8)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 2,
}

const imageSkeletonStyle: React.CSSProperties = {
  width: 200,
  height: 140,
  borderRadius: 8,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
}

const imageErrorStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  width: 200,
  height: 140,
  borderRadius: 8,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  color: 'var(--text-dim, #475569)',
  fontSize: 11,
}

// ---------------------------------------------------------------------------
// ImageAttachment
// ---------------------------------------------------------------------------

function ImageAttachment({ attachmentId, name }: { attachmentId?: string; name: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  // Fetch signed URL on mount
  React.useEffect(() => {
    if (!attachmentId) {
      setStatus('error')
      return
    }
    let cancelled = false
    fetchSignedUrl(attachmentId).then(result => {
      if (cancelled) return
      if (result?.signedUrl) {
        setSignedUrl(result.signedUrl)
      } else {
        setStatus('error')
      }
    })
    return () => { cancelled = true }
  }, [attachmentId])

  const handleClick = useCallback(async () => {
    if (!attachmentId) return
    // Always fetch a fresh signed URL on click (they expire)
    const result = await fetchSignedUrl(attachmentId)
    if (result?.signedUrl) {
      window.open(result.signedUrl, '_blank', 'noopener')
    }
  }, [attachmentId])

  if (status === 'error') {
    return (
      <div style={imageErrorStyle}>
        <ImageOff size={20} />
        <span>{truncateFilename(name, 24)}</span>
      </div>
    )
  }

  if (!signedUrl) {
    return <div style={imageSkeletonStyle} />
  }

  return (
    <img
      src={signedUrl}
      alt={name}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      onClick={handleClick}
      title={`${name} — Click to open full size`}
      style={{
        maxWidth: 300,
        maxHeight: 200,
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.03)',
        cursor: 'pointer',
        objectFit: 'cover',
        display: status === 'loaded' ? 'block' : 'none',
        transition: 'opacity 200ms ease',
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// FileCard (PDFs and other files)
// ---------------------------------------------------------------------------

function FileCard({ attachmentId, name, type, size }: { attachmentId?: string; name: string; type: string; size?: number }) {
  const [hovered, setHovered] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const isPdf = type === 'application/pdf'
  const IconComponent = isPdf ? FileText : File

  const handleClick = useCallback(async () => {
    if (!attachmentId || downloading) return
    setDownloading(true)
    try {
      const result = await fetchSignedUrl(attachmentId)
      if (result?.signedUrl) {
        window.open(result.signedUrl, '_blank', 'noopener')
      }
    } finally {
      setDownloading(false)
    }
  }, [attachmentId, downloading])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={hovered ? fileCardHoverStyle : fileCardStyle}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 8,
        background: isPdf ? 'rgba(239, 68, 68, 0.12)' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
        flexShrink: 0,
      }}>
        <IconComponent
          size={18}
          style={{ color: isPdf ? '#ef4444' : 'var(--text-secondary, #94A3B8)' }}
        />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={filenameStyle}>{truncateFilename(name)}</div>
        {size && size > 0 && <div style={fileSizeStyle}>{formatFileSize(size)}</div>}
        <div style={downloadLabelStyle}>
          {downloading ? (
            <span>Opening...</span>
          ) : (
            <>
              <Download size={10} />
              <span>{isPdf ? 'Open PDF' : 'Download'}</span>
            </>
          )}
        </div>
      </div>
      <ExternalLink size={14} style={{ color: 'var(--text-dim, #475569)', flexShrink: 0 }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatAttachment (public)
// ---------------------------------------------------------------------------

export function ChatAttachment({ type, name, url, size, attachmentId }: ChatAttachmentProps) {
  const isImage = type.startsWith('image/')

  if (isImage) {
    return <ImageAttachment attachmentId={attachmentId} name={name} />
  }

  return <FileCard attachmentId={attachmentId} name={name} type={type} size={size} />
}

// ---------------------------------------------------------------------------
// ChatAttachmentList (public)
// ---------------------------------------------------------------------------

export function ChatAttachmentList({ attachments }: ChatAttachmentListProps) {
  if (!attachments || attachments.length === 0) return null

  // Separate images and non-images for layout
  const images = attachments.filter(a => a.type.startsWith('image/'))
  const files = attachments.filter(a => !a.type.startsWith('image/'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((att, i) => (
            <ChatAttachment
              key={`img-${i}-${att.name}`}
              type={att.type}
              name={att.name}
              url={att.url}
              size={att.size}
              attachmentId={att.attachmentId}
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((att, i) => (
            <ChatAttachment
              key={`file-${i}-${att.name}`}
              type={att.type}
              name={att.name}
              url={att.url}
              size={att.size}
              attachmentId={att.attachmentId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

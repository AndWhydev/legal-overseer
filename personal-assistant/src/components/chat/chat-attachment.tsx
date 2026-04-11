'use client'

import React, { useState, useCallback } from 'react'
import { IconFileText, IconFile, IconPhotoOff, IconDownload, IconExternalLink } from '@tabler/icons-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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
      <div className="flex flex-col items-center justify-center gap-1.5 w-[200px] h-[140px] rounded-lg bg-muted border border-border text-muted-foreground text-sm">
        <IconPhotoOff size={20} />
        <span>{truncateFilename(name, 24)}</span>
      </div>
    )
  }

  if (!signedUrl) {
    return <Skeleton className="w-[200px] h-[140px] rounded-lg" />
  }

  return (
    <img
      src={signedUrl}
      alt={name}
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      onClick={handleClick}
      title={`${name} — Click to open full size`}
      className={`max-w-[300px] max-h-[200px] rounded-lg border border-border cursor-pointer object-cover transition-opacity duration-200 ${
        status === 'loaded' ? 'block' : 'hidden'
      }`}
    />
  )
}

// ---------------------------------------------------------------------------
// FileCard (PDFs and other files)
// ---------------------------------------------------------------------------

function FileCard({ attachmentId, name, type, size }: { attachmentId?: string; name: string; type: string; size?: number }) {
  const [downloading, setDownloading] = useState(false)
  const isPdf = type === 'application/pdf'

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
    <Card
      className="inline-flex items-center gap-2.5 px-3.5 py-2.5 max-w-[320px] cursor-pointer hover:bg-muted transition-colors"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
        isPdf ? 'bg-destructive/10' : 'bg-muted'
      }`}>
        {isPdf
          ? <IconFileText size={18} className="text-destructive" />
          : <IconFile size={18} className="text-muted-foreground" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {truncateFilename(name)}
        </div>
        {size && size > 0 && (
          <div className="text-sm text-muted-foreground mt-0.5">{formatFileSize(size)}</div>
        )}
        <div className="inline-flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
          {downloading ? (
            <span>Opening...</span>
          ) : (
            <>
              <IconDownload size={10} />
              <span>{isPdf ? 'Open PDF' : 'Download'}</span>
            </>
          )}
        </div>
      </div>
      <IconExternalLink size={14} className="text-muted-foreground shrink-0" />
    </Card>
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
    <div className="flex flex-col gap-2 mb-1.5">
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

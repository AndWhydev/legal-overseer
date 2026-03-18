'use client'

import { useState, useRef } from 'react'
import type { PortalFile } from '@/lib/portal/types'

interface PortalFilesProps {
  files: PortalFile[]
  orgSlug: string
  canUpload: boolean
  primary: string
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '&#128196;',
  'image/': '&#128247;',
  'video/': '&#127909;',
  'audio/': '&#127925;',
  'text/': '&#128221;',
  'application/zip': '&#128230;',
}

function getFileIcon(mimeType: string): string {
  for (const [prefix, icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(prefix)) return icon
  }
  return '&#128196;'
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function PortalFiles({ files, orgSlug, canUpload, primary }: PortalFilesProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [localFiles, setLocalFiles] = useState(files)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/portal/files?slug=${orgSlug}`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { file: newFile } = await res.json()
      setLocalFiles(prev => [newFile, ...prev])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a2e', margin: 0 }}>Files</h2>
        {canUpload && (
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              backgroundColor: primary,
              color: '#ffffff',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {uploading ? 'Uploading...' : 'Upload File'}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {uploadError && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 16,
        }}>
          {uploadError}
        </div>
      )}

      {localFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128193;</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>No files yet</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {canUpload ? 'Upload files to share with your team.' : 'Files shared with you will appear here.'}
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          {localFiles.map((file, i) => (
            <div
              key={file.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < localFiles.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span
                  style={{ fontSize: 20, flexShrink: 0 }}
                  dangerouslySetInnerHTML={{ __html: getFileIcon(file.mime_type) }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.file_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                    {formatFileSize(file.file_size)} &middot; {new Date(file.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    {file.uploaded_by_portal && <span style={{ marginLeft: 8, color: primary }}>You</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

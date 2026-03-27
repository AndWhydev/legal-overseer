'use client'

import { useState, useRef, useCallback } from 'react'
import type { PortalFile } from '@/lib/portal/types'

interface PortalFilesViewProps {
  initialFiles: PortalFile[]
  primaryColor: string
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  design: 'Design',
  document: 'Document',
  deliverable: 'Deliverable',
  asset: 'Asset',
  invoice: 'Invoice',
  contract: 'Contract',
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/svg+xml': 'SVG',
  'application/zip': 'ZIP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'TXT',
}

export function PortalFilesView({ initialFiles, primaryColor }: PortalFilesViewProps) {
  const [files, setFiles] = useState<PortalFile[]>(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = filter === 'all' ? files : files.filter(f => f.category === filter)

  const handleUpload = useCallback(async (fileList: FileList) => {
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category', 'general')

        const res = await fetch('/api/portal/files', {
          method: 'POST',
          body: formData,
        })

        if (res.ok) {
          const data = await res.json()
          setFiles(prev => [data.file, ...prev])
        }
      }
    } catch {
      // Handle error silently
    } finally {
      setUploading(false)
    }
  }, [])

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const categories = Array.from(new Set(files.map(f => f.category)))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-medium tracking-tight text-gray-900">
          Files
        </h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border-none px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: primaryColor, cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={e => e.target.files && handleUpload(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {/* Category Filters */}
      {categories.length > 1 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: filter === 'all' ? 500 : 400,
              background: filter === 'all' ? `${primaryColor}0D` : 'transparent',
              color: filter === 'all' ? primaryColor : '#6B7280',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: filter === cat ? 500 : 400,
                background: filter === cat ? `${primaryColor}0D` : 'transparent',
                color: filter === cat ? primaryColor : '#6B7280',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files)
        }}
        style={{
          ...cardStyle,
          border: dragOver ? `2px dashed ${primaryColor}` : '2px dashed #E5E7EB',
          background: dragOver ? `${primaryColor}05` : '#FAFAFA',
          padding: '32px 24px',
          textAlign: 'center',
          marginBottom: 24,
          transition: 'all 200ms',
          borderRadius: 12,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={dragOver ? primaryColor : '#D1D5DB'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p style={{ fontSize: 14, color: dragOver ? primaryColor : '#6B7280', margin: 0 }}>
          Drag files here or <button onClick={() => fileInputRef.current?.click()} style={{ color: primaryColor, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}>browse</button>
        </p>
        <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>Max 50MB per file</p>
      </div>

      {/* File List */}
      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: 'center', border: '1px solid #E5E7EB' }}>
          <p style={{ fontSize: 16, color: '#9CA3AF' }}>No files uploaded yet</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {filtered.map((file, i) => {
            const ext = FILE_ICONS[file.file_type ?? ''] ?? file.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'

            return (
              <div
                key={file.id}
                className="flex items-center gap-4"
                style={{
                  padding: '12px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                }}
              >
                {/* File Icon */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: `${primaryColor}0D`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 500,
                    color: primaryColor,
                    flexShrink: 0,
                  }}
                >
                  {ext}
                </div>

                {/* File Info */}
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.file_name}
                  </p>
                  <div className="flex items-center gap-3" style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 14, color: '#9CA3AF' }}>{formatSize(file.file_size)}</span>
                    <span style={{ fontSize: 14, color: '#9CA3AF' }}>
                      {new Date(file.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: file.uploaded_by_role === 'client' ? '#EFF6FF' : '#F0FDF4',
                        color: file.uploaded_by_role === 'client' ? '#2563EB' : '#059669',
                        fontWeight: 500,
                      }}
                    >
                      {file.uploaded_by_role === 'client' ? 'You' : 'Agency'}
                    </span>
                  </div>
                </div>

                {/* Download button */}
                <button
                  onClick={() => window.open(`/api/portal/files/download?path=${encodeURIComponent(file.storage_path)}`, '_blank')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'transparent',
                    border: '1px solid #E5E7EB',
                    color: '#374151',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 150ms',
                    flexShrink: 0,
                  }}
                >
                  Download
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
}

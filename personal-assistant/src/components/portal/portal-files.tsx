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
        <h1 className="text-base font-medium tracking-tight text-foreground">
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
          className="hidden"
        />
      </div>

      {/* Category Filters */}
      {categories.length > 1 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className="px-4 py-2 rounded-lg text-sm border-none cursor-pointer"
            style={{
              fontWeight: filter === 'all' ? 500 : 400,
              background: filter === 'all' ? `${primaryColor}0D` : 'transparent',
              color: filter === 'all' ? primaryColor : 'var(--muted-foreground)',
            }}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="px-4 py-2 rounded-lg text-sm border-none cursor-pointer"
              style={{
                fontWeight: filter === cat ? 500 : 400,
                background: filter === cat ? `${primaryColor}0D` : 'transparent',
                color: filter === cat ? primaryColor : 'var(--muted-foreground)',
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
        className="rounded-xl px-6 py-8 text-center mb-6 transition-all duration-200"
        style={{
          border: dragOver ? `2px dashed ${primaryColor}` : '2px dashed var(--border)',
          background: dragOver ? `${primaryColor}05` : 'var(--background)',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={dragOver ? primaryColor : 'var(--border)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm m-0" style={{ color: dragOver ? primaryColor : 'var(--muted-foreground)' }}>
          Drag files here or <button onClick={() => fileInputRef.current?.click()} className="bg-transparent border-none cursor-pointer underline text-sm" style={{ color: primaryColor }}>browse</button>
        </p>
        <p className="text-sm text-muted-foreground mt-1">Max 50MB per file</p>
      </div>

      {/* File List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-base text-muted-foreground">No files uploaded yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {filtered.map((file, i) => {
            const ext = FILE_ICONS[file.file_type ?? ''] ?? file.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'

            return (
              <div
                key={file.id}
                className="flex items-center gap-4 px-5 py-3"
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--muted)' : 'none',
                }}
              >
                {/* File Icon */}
                <div
                  className="flex items-center justify-center rounded-lg text-sm font-medium shrink-0"
                  style={{
                    width: 44,
                    height: 44,
                    background: `${primaryColor}0D`,
                    color: primaryColor,
                  }}
                >
                  {ext}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground m-0 truncate">
                    {file.file_name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-sm text-muted-foreground">{formatSize(file.file_size)}</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(file.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span
                      className="text-sm font-medium px-2 py-0.5 rounded-lg"
                      style={{
                        background: file.uploaded_by_role === 'client' ? '#EFF6FF' : '#F0FDF4',
                        color: file.uploaded_by_role === 'client' ? '#2563EB' : 'var(--success)',
                      }}
                    >
                      {file.uploaded_by_role === 'client' ? 'You' : 'Agency'}
                    </span>
                  </div>
                </div>

                {/* Download button */}
                <button
                  onClick={() => window.open(`/api/portal/files/download?path=${encodeURIComponent(file.storage_path)}`, '_blank')}
                  className="px-4 py-2 rounded-lg bg-transparent border border-border text-foreground text-sm font-medium cursor-pointer transition-all duration-150 shrink-0"
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

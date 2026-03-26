'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  validateFile,
  MAX_FILES_PER_MESSAGE,
  ALLOWED_MIME_TYPES,
} from '@/lib/attachments/constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadItem {
  id: string           // attachment ID from server (or temp ID while pending)
  filename: string
  mimeType: string
  size: number
  progress: number     // 0-100
  status: 'pending' | 'uploading' | 'ready' | 'error'
  previewUrl?: string  // Object.createObjectURL for local image preview
  error?: string
}

export interface UseFileUploadReturn {
  uploads: UploadItem[]
  addFiles: (files: FileList | File[]) => Promise<void>
  removeUpload: (id: string) => void
  clearUploads: () => void
  readyAttachmentIds: string[]
  isUploading: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileUpload(threadId?: string | null): UseFileUploadReturn {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map())

  // ---- addFiles ----
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)

    // Build pending items for all valid files first, so they all appear immediately
    const filesToUpload: { file: File; tempId: string }[] = []

    setUploads(prev => {
      const remaining = MAX_FILES_PER_MESSAGE - prev.filter(u => u.status !== 'error').length
      const accepted = fileArray.slice(0, Math.max(0, remaining))
      const newItems: UploadItem[] = []

      for (const file of accepted) {
        const validation = validateFile(file.name, file.type, file.size)
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        if (!validation.valid) {
          newItems.push({
            id: `err-${tempId}`,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            progress: 0,
            status: 'error',
            error: validation.error,
          })
        } else {
          const previewUrl = file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : undefined
          newItems.push({
            id: tempId,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            progress: 0,
            status: 'pending',
            previewUrl,
          })
          filesToUpload.push({ file, tempId })
        }
      }

      return [...prev, ...newItems]
    })

    // Upload all files concurrently
    const uploadOne = async (file: File, tempId: string) => {
      try {
        const res = await fetch('/api/attachments/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            threadId: threadId || undefined,
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          setUploads(prev =>
            prev.map(u =>
              u.id === tempId
                ? { ...u, status: 'error', error: errText || 'Failed to create upload URL' }
                : u
            )
          )
          return
        }

        const { attachmentId, signedUrl } = await res.json()

        // Update item with real attachment ID
        setUploads(prev =>
          prev.map(u =>
            u.id === tempId
              ? { ...u, id: attachmentId, status: 'uploading' }
              : u
          )
        )

        // Upload file directly to Supabase Storage via XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrMapRef.current.set(attachmentId, xhr)

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100)
              setUploads(prev =>
                prev.map(u =>
                  u.id === attachmentId ? { ...u, progress: pct } : u
                )
              )
            }
          }

          xhr.onload = () => {
            xhrMapRef.current.delete(attachmentId)
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }

          xhr.onerror = () => {
            xhrMapRef.current.delete(attachmentId)
            reject(new Error('Upload failed'))
          }

          xhr.onabort = () => {
            xhrMapRef.current.delete(attachmentId)
            reject(new Error('Upload aborted'))
          }

          xhr.open('PUT', signedUrl)
          xhr.setRequestHeader('Content-Type', file.type)
          xhr.send(file)
        })

        // Confirm upload
        const confirmRes = await fetch(`/api/attachments/${attachmentId}`, {
          method: 'PATCH',
        })

        if (!confirmRes.ok) {
          setUploads(prev =>
            prev.map(u =>
              u.id === attachmentId
                ? { ...u, status: 'error', error: 'Failed to confirm upload' }
                : u
            )
          )
          return
        }

        // Mark as ready
        setUploads(prev =>
          prev.map(u =>
            u.id === attachmentId
              ? { ...u, status: 'ready', progress: 100 }
              : u
          )
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Upload failed'
        setUploads(prev =>
          prev.map(u =>
            u.id === tempId || (u.filename === file.name && u.status === 'uploading')
              ? { ...u, status: 'error', error: errMsg }
              : u
          )
        )
      }
    }

    // Stagger upload starts by 150ms each to avoid Supabase storage rate limits,
    // but still run concurrently (each upload proceeds independently after starting)
    await Promise.all(filesToUpload.map(({ file, tempId }, i) =>
      new Promise<void>(resolve => setTimeout(resolve, i * 150)).then(() => uploadOne(file, tempId))
    ))
  }, [threadId])

  // ---- removeUpload ----
  const removeUpload = useCallback((id: string) => {
    // Abort any in-progress XHR
    const xhr = xhrMapRef.current.get(id)
    if (xhr) {
      xhr.abort()
      xhrMapRef.current.delete(id)
    }

    setUploads(prev => {
      const item = prev.find(u => u.id === id)
      // Revoke object URL if it exists
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl)
      }
      return prev.filter(u => u.id !== id)
    })
  }, [])

  // ---- clearUploads ----
  const clearUploads = useCallback(() => {
    // Abort all in-progress XHRs
    xhrMapRef.current.forEach(xhr => xhr.abort())
    xhrMapRef.current.clear()

    // Revoke all object URLs
    setUploads(prev => {
      for (const item of prev) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      }
      return []
    })
  }, [])

  // ---- Computed values ----
  const readyAttachmentIds = useMemo(
    () => uploads.filter(u => u.status === 'ready').map(u => u.id),
    [uploads]
  )

  const isUploading = useMemo(
    () => uploads.some(u => u.status === 'pending' || u.status === 'uploading'),
    [uploads]
  )

  return {
    uploads,
    addFiles,
    removeUpload,
    clearUploads,
    readyAttachmentIds,
    isUploading,
  }
}

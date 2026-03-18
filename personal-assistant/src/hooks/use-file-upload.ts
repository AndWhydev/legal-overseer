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

    // Enforce max files cap
    setUploads(prev => {
      const remaining = MAX_FILES_PER_MESSAGE - prev.filter(u => u.status !== 'error').length
      if (remaining <= 0) return prev // silently ignore
      return prev // actual state update happens below
    })

    for (const file of fileArray) {
      // Check cap against current state
      const currentCount = uploads.filter(u => u.status !== 'error').length
      if (currentCount + fileArray.indexOf(file) >= MAX_FILES_PER_MESSAGE) {
        break
      }

      // Client-side validation
      const validation = validateFile(file.name, file.type, file.size)
      if (!validation.valid) {
        const errorItem: UploadItem = {
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          progress: 0,
          status: 'error',
          error: validation.error,
        }
        setUploads(prev => [...prev, errorItem])
        continue
      }

      // Create local preview for images
      let previewUrl: string | undefined
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file)
      }

      // Temp ID while we request the signed URL
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const pendingItem: UploadItem = {
        id: tempId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        progress: 0,
        status: 'pending',
        previewUrl,
      }
      setUploads(prev => [...prev, pendingItem])

      // Request signed upload URL from the server
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
          continue
        }

        const { attachmentId, signedUrl, token } = await res.json()

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

          // Supabase Storage signed upload expects PUT with the token as a query param
          const uploadUrl = signedUrl.includes('?')
            ? `${signedUrl}&token=${encodeURIComponent(token)}`
            : `${signedUrl}?token=${encodeURIComponent(token)}`

          xhr.open('PUT', uploadUrl)
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
          continue
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
  }, [threadId, uploads])

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

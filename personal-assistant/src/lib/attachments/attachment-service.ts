import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import {
  validateFile,
  STORAGE_BUCKET,
  DOWNLOAD_URL_EXPIRY,
} from './constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateUploadUrlParams {
  orgId: string
  userId: string
  threadId?: string | null
  filename: string
  mimeType: string
  size: number
}

interface CreateUploadUrlResult {
  attachmentId: string
  signedUrl: string
  token: string
  path: string
}

interface AttachmentRecord {
  id: string
  org_id: string
  user_id: string
  thread_id: string | null
  message_id: string | null
  filename: string
  mime_type: string
  size: number
  storage_path: string
  status: string
  extracted_text: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface DownloadUrlResult {
  signedUrl: string
  attachment: AttachmentRecord
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a signed upload URL for direct client-to-storage upload.
 * Validates the file, inserts a DB record (status='uploading'), and returns
 * the Supabase Storage signed URL for PUT upload.
 */
export async function createUploadUrl(
  supabase: SupabaseClient,
  params: CreateUploadUrlParams,
): Promise<CreateUploadUrlResult> {
  const { orgId, userId, threadId, filename, mimeType, size } = params

  // Validate file metadata
  const validation = validateFile(filename, mimeType, size)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Generate storage path: {org_id}/{thread_id|unthreaded}/{uuid}/{filename}
  const fileId = crypto.randomUUID()
  const storagePath = `${orgId}/${threadId || 'unthreaded'}/${fileId}/${filename}`

  // Create signed upload URL (2-hour expiry, set by Supabase)
  const { data: signedData, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedError || !signedData) {
    logger.error('[attachments] Failed to create signed upload URL:', signedError?.message)
    throw new Error('Failed to create upload URL')
  }

  // Insert attachment record
  const { data: attachment, error: dbError } = await supabase
    .from('attachments')
    .insert({
      id: fileId,
      org_id: orgId,
      user_id: userId,
      thread_id: threadId || null,
      filename,
      mime_type: mimeType,
      size,
      storage_path: storagePath,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (dbError || !attachment) {
    logger.error('[attachments] Failed to insert attachment record:', dbError?.message)
    throw new Error('Failed to create attachment record')
  }

  return {
    attachmentId: attachment.id,
    signedUrl: signedData.signedUrl,
    token: signedData.token,
    path: signedData.path,
  }
}

/**
 * Confirm an upload is complete by marking the attachment as 'ready'.
 * Called after the client has successfully PUT the file to the signed URL.
 */
export async function confirmUpload(
  supabase: SupabaseClient,
  attachmentId: string,
  orgId: string,
): Promise<AttachmentRecord> {
  const { data, error } = await supabase
    .from('attachments')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', attachmentId)
    .eq('org_id', orgId)
    .select()
    .single<AttachmentRecord>()

  if (error || !data) {
    logger.error('[attachments] Failed to confirm upload:', error?.message)
    throw new Error('Failed to confirm upload')
  }

  return data
}

/**
 * Get a signed download URL for a ready attachment.
 * Only returns URLs for attachments with status='ready'.
 */
export async function getDownloadUrl(
  supabase: SupabaseClient,
  attachmentId: string,
  orgId: string,
): Promise<DownloadUrlResult> {
  // Fetch the attachment record
  const { data: attachment, error: fetchError } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('org_id', orgId)
    .eq('status', 'ready')
    .single<AttachmentRecord>()

  if (fetchError || !attachment) {
    logger.error('[attachments] Attachment not found or not ready:', fetchError?.message)
    throw new Error('Attachment not found or not ready')
  }

  // Generate signed download URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(attachment.storage_path, DOWNLOAD_URL_EXPIRY)

  if (signedError || !signedData) {
    logger.error('[attachments] Failed to create download URL:', signedError?.message)
    throw new Error('Failed to create download URL')
  }

  return {
    signedUrl: signedData.signedUrl,
    attachment,
  }
}

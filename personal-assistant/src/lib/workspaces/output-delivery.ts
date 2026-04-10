/**
 * Output Delivery Pipeline — format, truncate, and store workspace results
 *
 * Bridges workspace execution results back into the TAOR loop by:
 * - Formatting stdout/stderr/error into a single inline string
 * - Truncating to MAX_INLINE_CHARS (12K) to match tool-executor limits
 * - Storing the full output as an artifact when truncated
 * - Uploading large artifacts to Supabase Storage
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceExecResult, WorkspaceArtifact } from './types'
import { saveWorkspaceArtifact } from './workspace-store'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum characters for inline output returned to the agent loop. */
export const MAX_INLINE_CHARS = 12_000

/** Supabase Storage bucket for workspace artifacts. */
const STORAGE_BUCKET = 'workspace-artifacts'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DeliveryResult {
  /** Inline output string, truncated to MAX_INLINE_CHARS if needed. */
  inline: string
  /** Whether the output was truncated. */
  truncated: boolean
  /** IDs of artifacts stored in the database. */
  storedArtifactIds: string[]
}

/**
 * Deliver workspace output: format, truncate, store artifacts.
 *
 * @param supabase     Authenticated Supabase client
 * @param workspaceId  Workspace session ID
 * @param execResult   Raw execution result from the provider
 * @returns Formatted inline output and metadata about stored artifacts
 */
export async function deliverWorkspaceOutput(
  supabase: SupabaseClient,
  workspaceId: string,
  execResult: WorkspaceExecResult,
): Promise<DeliveryResult> {
  const formatted = formatOutput(execResult)
  const storedArtifactIds: string[] = []

  let inline = formatted
  let truncated = false

  // If the output exceeds inline limits, truncate and store full as artifact
  if (formatted.length > MAX_INLINE_CHARS) {
    truncated = true
    inline =
      formatted.slice(0, MAX_INLINE_CHARS) +
      '\n\n[Content truncated — ' +
      (formatted.length - MAX_INLINE_CHARS).toLocaleString() +
      ' chars omitted. Full output stored as artifact.]'

    try {
      const fullOutputArtifact = await saveWorkspaceArtifact(supabase, workspaceId, {
        type: 'data',
        name: 'full-output.txt',
        content: formatted,
        mimeType: 'text/plain',
        sizeBytes: new TextEncoder().encode(formatted).byteLength,
      })
      storedArtifactIds.push(fullOutputArtifact.id)
    } catch (err) {
      logger.error('[output-delivery] Failed to store full output artifact', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Store any artifacts produced during execution
  if (execResult.artifacts && execResult.artifacts.length > 0) {
    for (const artifact of execResult.artifacts) {
      try {
        // Large artifacts go to Supabase Storage; small ones stay inline
        let artifactToStore = artifact
        if (artifact.content && artifact.content.length > MAX_INLINE_CHARS) {
          const storagePath = await storeInStorage(
            supabase,
            workspaceId,
            artifact.name,
            artifact.content,
          )
          artifactToStore = {
            ...artifact,
            content: undefined,
            storagePath,
            sizeBytes: new TextEncoder().encode(artifact.content).byteLength,
          }
        }

        const stored = await saveWorkspaceArtifact(supabase, workspaceId, artifactToStore)
        storedArtifactIds.push(stored.id)
      } catch (err) {
        logger.error('[output-delivery] Failed to store artifact', {
          workspaceId,
          artifactName: artifact.name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  logger.info('[output-delivery] Output delivered', {
    workspaceId,
    inlineLength: inline.length,
    truncated,
    artifactCount: storedArtifactIds.length,
  })

  return { inline, truncated, storedArtifactIds }
}

// ---------------------------------------------------------------------------
// Storage helper
// ---------------------------------------------------------------------------

/**
 * Upload content to Supabase Storage under the workspace artifacts bucket.
 *
 * @param supabase     Authenticated Supabase client
 * @param workspaceId  Workspace session ID (used as folder prefix)
 * @param filename     File name for the artifact
 * @param content      String content to upload
 * @returns The storage path of the uploaded file
 */
export async function storeInStorage(
  supabase: SupabaseClient,
  workspaceId: string,
  filename: string,
  content: string,
): Promise<string> {
  const path = `${workspaceId}/${filename}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, new TextEncoder().encode(content), {
      contentType: guessMimeType(filename),
      upsert: true,
    })

  if (error) {
    throw new Error(`Storage upload failed for ${path}: ${error.message}`)
  }

  logger.info('[output-delivery] Artifact uploaded to storage', { path })
  return path
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Format an execution result into a human-readable string for the agent.
 */
function formatOutput(result: WorkspaceExecResult): string {
  const parts: string[] = []

  if (result.error) {
    parts.push(`[ERROR] ${result.error}`)
  }

  if (result.stdout) {
    parts.push(result.stdout)
  }

  if (result.stderr) {
    parts.push(`[stderr] ${result.stderr}`)
  }

  if (result.artifacts && result.artifacts.length > 0) {
    const names = result.artifacts.map(a => a.name).join(', ')
    parts.push(`[artifacts] ${names}`)
  }

  const output = parts.join('\n\n')
  return output || '(no output)'
}

/**
 * Guess MIME type from filename extension.
 */
function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    txt: 'text/plain',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
  }
  return mimeMap[ext ?? ''] ?? 'application/octet-stream'
}

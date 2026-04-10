/**
 * Workspace Store — Supabase CRUD for workspace sessions and artifacts
 *
 * Follows the same pattern as approval-queue.ts: accept a SupabaseClient,
 * perform typed queries, and return camelCase domain objects.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  WorkspaceSession,
  WorkspaceArtifact,
  WorkspaceStatus,
  WorkspaceTemplate,
} from './types'

// ---------------------------------------------------------------------------
// Row types (snake_case, matching the DB schema)
// ---------------------------------------------------------------------------

interface WorkspaceSessionRow {
  id: string
  org_id: string
  task_id: string | null
  sandbox_id: string
  status: WorkspaceStatus
  purpose: string
  template: WorkspaceTemplate
  started_at: string
  completed_at: string | null
  total_seconds: number
  cost_usd: number
  created_at: string
  updated_at: string
}

interface WorkspaceArtifactRow {
  id: string
  workspace_id: string
  artifact_type: WorkspaceArtifact['type']
  name: string
  content: string | null
  storage_path: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Mappers (snake_case → camelCase)
// ---------------------------------------------------------------------------

export function mapSessionRow(row: WorkspaceSessionRow): WorkspaceSession {
  return {
    id: row.id,
    orgId: row.org_id,
    taskId: row.task_id ?? undefined,
    sandboxId: row.sandbox_id,
    status: row.status,
    purpose: row.purpose,
    template: row.template,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    totalSeconds: Number(row.total_seconds),
    costUsd: Number(row.cost_usd),
  }
}

export function mapArtifactRow(row: WorkspaceArtifactRow): WorkspaceArtifact & { id: string; workspaceId: string } {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.artifact_type,
    name: row.name,
    content: row.content ?? undefined,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateWorkspaceOpts {
  taskId?: string
  sandboxId: string
  purpose: string
  template?: WorkspaceTemplate
}

export async function createWorkspaceSession(
  supabase: SupabaseClient,
  orgId: string,
  opts: CreateWorkspaceOpts,
): Promise<WorkspaceSession> {
  const { data, error } = await supabase
    .from('workspace_sessions')
    .insert({
      org_id: orgId,
      task_id: opts.taskId ?? null,
      sandbox_id: opts.sandboxId,
      status: 'running' as WorkspaceStatus,
      purpose: opts.purpose,
      template: opts.template ?? 'default',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single<WorkspaceSessionRow>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create workspace session')
  }

  return mapSessionRow(data)
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getWorkspaceSession(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceSession | null> {
  const { data, error } = await supabase
    .from('workspace_sessions')
    .select('*')
    .eq('id', workspaceId)
    .single<WorkspaceSessionRow>()

  if (error) {
    if (error.code === 'PGRST116') return null // row not found
    throw new Error(error.message)
  }

  return data ? mapSessionRow(data) : null
}

export async function getWorkspaceSessionBySandboxId(
  supabase: SupabaseClient,
  sandboxId: string,
): Promise<WorkspaceSession | null> {
  const { data, error } = await supabase
    .from('workspace_sessions')
    .select('*')
    .eq('sandbox_id', sandboxId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single<WorkspaceSessionRow>()

  if (error) {
    if (error.code === 'PGRST116') return null // row not found
    throw new Error(error.message)
  }

  return data ? mapSessionRow(data) : null
}

export async function getActiveWorkspace(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WorkspaceSession | null> {
  const { data, error } = await supabase
    .from('workspace_sessions')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .single<WorkspaceSessionRow>()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? mapSessionRow(data) : null
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateWorkspaceExtras {
  completedAt?: string
  totalSeconds?: number
  costUsd?: number
  taskId?: string
}

export async function updateWorkspaceStatus(
  supabase: SupabaseClient,
  workspaceId: string,
  status: WorkspaceStatus,
  extras?: UpdateWorkspaceExtras,
): Promise<WorkspaceSession> {
  const updatePayload: Record<string, unknown> = { status }

  if (extras?.completedAt) updatePayload.completed_at = extras.completedAt
  if (extras?.totalSeconds !== undefined) updatePayload.total_seconds = extras.totalSeconds
  if (extras?.costUsd !== undefined) updatePayload.cost_usd = extras.costUsd
  if (extras?.taskId) updatePayload.task_id = extras.taskId

  const { data, error } = await supabase
    .from('workspace_sessions')
    .update(updatePayload)
    .eq('id', workspaceId)
    .select('*')
    .single<WorkspaceSessionRow>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update workspace session')
  }

  return mapSessionRow(data)
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export async function saveWorkspaceArtifact(
  supabase: SupabaseClient,
  workspaceId: string,
  artifact: WorkspaceArtifact,
): Promise<WorkspaceArtifact & { id: string; workspaceId: string }> {
  const { data, error } = await supabase
    .from('workspace_artifacts')
    .insert({
      workspace_id: workspaceId,
      artifact_type: artifact.type,
      name: artifact.name,
      content: artifact.content ?? null,
      storage_path: artifact.storagePath ?? null,
      mime_type: artifact.mimeType ?? null,
      size_bytes: artifact.sizeBytes ?? null,
    })
    .select('*')
    .single<WorkspaceArtifactRow>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save workspace artifact')
  }

  return mapArtifactRow(data)
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export async function getDailyWorkspaceCost(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('workspace_sessions')
    .select('cost_usd')
    .eq('org_id', orgId)
    .gte('started_at', startOfDay.toISOString())

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).reduce(
    (sum, row) => sum + Number((row as { cost_usd: number }).cost_usd),
    0,
  )
}

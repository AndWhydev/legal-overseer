import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsanaCredentials {
  access_token: string
  refresh_token?: string
}

export interface AsanaError {
  error: string
  details?: string
}

export interface AsanaTask {
  gid: string
  name: string
  notes?: string
  completed: boolean
  due_on?: string | null
  assignee?: { gid: string; name: string; email?: string } | null
  projects?: Array<{ gid: string; name: string }>
  workspace?: { gid: string; name: string }
  created_at?: string
  modified_at?: string
  tags?: Array<{ gid: string; name: string }>
}

export interface AsanaWorkspace {
  gid: string
  name: string
}

export interface AsanaProject {
  gid: string
  name: string
  workspace?: { gid: string }
}

export interface AsanaCreateTaskData {
  name: string
  notes?: string
  workspace?: string
  projects?: string[]
  assignee?: string
  due_on?: string
  tags?: string[]
}

export interface AsanaUpdateTaskData {
  name?: string
  notes?: string
  completed?: boolean
  due_on?: string | null
  assignee?: string | null
}

export interface AsanaWebhookEvent {
  action: string
  resource: { gid: string; resource_type: string }
  parent?: { gid: string; resource_type: string }
  change?: { field: string; action: string }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const ASANA_BASE = 'https://app.asana.com/api/1.0'

async function asanaFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Asana API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const creds = (await getOrgCredential(client, orgId, 'asana')) as AsanaCredentials | null
  return creds?.access_token ?? null
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function fetchAsanaWorkspaces(
  client: SupabaseClient,
  orgId: string,
): Promise<AsanaWorkspace[] | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const data = await asanaFetch<{ data: AsanaWorkspace[] }>(token, '/workspaces')
    return data.data
  } catch (err) {
    return { error: 'Failed to fetch workspaces', details: String(err) }
  }
}

export async function fetchAsanaProjects(
  client: SupabaseClient,
  orgId: string,
  workspaceGid: string,
): Promise<AsanaProject[] | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const data = await asanaFetch<{ data: AsanaProject[] }>(
      token,
      `/workspaces/${workspaceGid}/projects?opt_fields=name,workspace`,
    )
    return data.data
  } catch (err) {
    return { error: 'Failed to fetch projects', details: String(err) }
  }
}

export async function fetchAsanaTasks(
  client: SupabaseClient,
  orgId: string,
  config: {
    projectGid?: string
    workspaceGid?: string
    assignee?: string
    completed_since?: string
  } = {},
): Promise<AsanaTask[] | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const fields =
      'name,notes,completed,due_on,assignee.name,assignee.email,projects.name,created_at,modified_at,tags.name'
    let path: string

    if (config.projectGid) {
      path = `/projects/${config.projectGid}/tasks?opt_fields=${fields}&limit=100`
    } else if (config.workspaceGid) {
      const assignee = config.assignee || 'me'
      path = `/tasks?workspace=${config.workspaceGid}&assignee=${assignee}&opt_fields=${fields}&limit=100`
      if (config.completed_since) {
        path += `&completed_since=${config.completed_since}`
      }
    } else {
      return { error: 'Either projectGid or workspaceGid is required' }
    }

    const data = await asanaFetch<{ data: AsanaTask[] }>(token, path)
    return data.data
  } catch (err) {
    return { error: 'Failed to fetch tasks', details: String(err) }
  }
}

export async function createAsanaTask(
  client: SupabaseClient,
  orgId: string,
  data: AsanaCreateTaskData,
): Promise<AsanaTask | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const result = await asanaFetch<{ data: AsanaTask }>(token, '/tasks', {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
    return result.data
  } catch (err) {
    return { error: 'Failed to create task', details: String(err) }
  }
}

export async function updateAsanaTask(
  client: SupabaseClient,
  orgId: string,
  taskId: string,
  data: AsanaUpdateTaskData,
): Promise<AsanaTask | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const result = await asanaFetch<{ data: AsanaTask }>(token, `/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    })
    return result.data
  } catch (err) {
    return { error: 'Failed to update task', details: String(err) }
  }
}

export async function registerAsanaWebhook(
  client: SupabaseClient,
  orgId: string,
  resourceGid: string,
  targetUrl: string,
): Promise<{ gid: string } | AsanaError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No Asana credentials configured' }

    const result = await asanaFetch<{ data: { gid: string } }>(token, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          resource: resourceGid,
          target: targetUrl,
          filters: [
            { resource_type: 'task', action: 'changed' },
            { resource_type: 'task', action: 'added' },
          ],
        },
      }),
    })
    return result.data
  } catch (err) {
    return { error: 'Failed to register webhook', details: String(err) }
  }
}

export function parseAsanaWebhookEvents(body: {
  events?: AsanaWebhookEvent[]
}): AsanaWebhookEvent[] {
  return body.events || []
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const asanaAdapter: ChannelAdapter = {
  type: 'asana',
  name: 'Asana',
  description: 'Sync tasks and projects from Asana',
  icon: 'CheckSquare',

  async pull(config, since) {
    const pat = process.env.ASANA_PAT || process.env.ASANA_ACCESS_TOKEN
    if (!pat) return []

    const workspaceGid =
      (config.workspaceGid as string | undefined) || process.env.ASANA_WORKSPACE_GID
    if (!workspaceGid) {
      console.error('[asana] No workspaceGid in config or ASANA_WORKSPACE_GID env')
      return []
    }

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      const fields =
        'name,notes,completed,due_on,assignee.name,assignee.email,projects.name,created_at,modified_at'
      const params = new URLSearchParams({
        workspace: workspaceGid,
        opt_fields: fields,
        limit: '100',
        modified_since: sinceDate.toISOString(),
      })

      const data = await asanaFetch<{ data: AsanaTask[] }>(pat, `/tasks?${params.toString()}`)

      return data.data.map((task): ChannelMessage => {
        const assignee = task.assignee
        const project = task.projects?.[0]

        return {
          id: `asana-${task.gid}`,
          channel: 'asana',
          externalId: task.gid,
          sender: assignee?.name || 'Asana',
          senderEmail: assignee?.email,
          subject: task.name,
          body: task.notes || task.name,
          receivedAt: new Date(task.modified_at || task.created_at || Date.now()),
          isActionable: !task.completed,
          priority:
            task.due_on && new Date(task.due_on) < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
              ? 'high'
              : 'medium',
          metadata: {
            gid: task.gid,
            completed: task.completed,
            due_on: task.due_on,
            projectGid: project?.gid,
            projectName: project?.name,
            workspaceGid,
          },
        }
      })
    } catch (err) {
      console.error('[asana] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.ASANA_PAT || process.env.ASANA_ACCESS_TOKEN)
  },
}

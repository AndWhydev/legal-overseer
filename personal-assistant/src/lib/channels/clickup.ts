import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClickUpCredentials {
  access_token: string
}

export interface ClickUpError {
  error: string
  details?: string
}

export interface ClickUpTask {
  id: string
  name: string
  description?: string | null
  status: { name: string; color: string }
  assignees: Array<{ id: string; username: string }>
  due_date?: string | null
  date_created?: string
  date_updated?: string
  list: { id: string; name: string }
  space: { id: string }
  priority?: { id: string; priority: string } | null
  tags?: Array<{ name: string; tag_bg?: string; tag_fg?: string }>
}

export interface ClickUpSpace {
  id: string
  name: string
}

export interface ClickUpList {
  id: string
  name: string
  space?: { id: string; name?: string }
}

export interface ClickUpWebhookEvent {
  event: string
  task_id?: string
  webhook_id?: string
  history_items?: Array<{
    id: string
    field: string
    before?: unknown
    after?: unknown
  }>
}

export interface ClickUpCreateTaskData {
  name: string
  description?: string
  assignees?: string[]
  due_date?: number | null
  priority?: number
  tags?: string[]
  status?: string
}

export interface ClickUpUpdateTaskData {
  name?: string
  description?: string
  status?: string
  assignees?: string[]
  due_date?: number | null
  priority?: number
  archived?: boolean
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const CLICKUP_BASE = 'https://api.clickup.com/api/v2'

async function clickUpFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickUp API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveToken(client: SupabaseClient, orgId: string): Promise<string | null> {
  const creds = (await getOrgCredential(client, orgId, 'clickup')) as ClickUpCredentials | null
  return creds?.access_token ?? null
}

function parseClickUpDate(value?: string | null): Date {
  if (!value) return new Date()

  const numericDate = Number(value)
  if (Number.isFinite(numericDate)) return new Date(numericDate)

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
}

function mapClickUpPriority(task: ClickUpTask): ChannelMessage['priority'] {
  const priority = task.priority?.priority?.toLowerCase()
  if (priority === 'urgent') return 'critical'
  if (priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'medium'
}

function isTaskOpen(task: ClickUpTask): boolean {
  const status = task.status.name.toLowerCase()
  return !status.includes('closed') && !status.includes('complete') && !status.includes('done')
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function fetchClickUpSpaces(
  client: SupabaseClient,
  orgId: string,
  teamId: string,
): Promise<ClickUpSpace[] | ClickUpError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No ClickUp credentials configured' }

    const data = await clickUpFetch<{ spaces: ClickUpSpace[] }>(token, `/team/${teamId}/space`)
    return data.spaces
  } catch (err) {
    return { error: 'Failed to fetch spaces', details: String(err) }
  }
}

export async function fetchClickUpLists(
  client: SupabaseClient,
  orgId: string,
  spaceId: string,
): Promise<ClickUpList[] | ClickUpError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No ClickUp credentials configured' }

    const data = await clickUpFetch<{ lists: ClickUpList[] }>(token, `/space/${spaceId}/list`)
    return data.lists
  } catch (err) {
    return { error: 'Failed to fetch lists', details: String(err) }
  }
}

export async function fetchClickUpTasks(
  client: SupabaseClient,
  orgId: string,
  config: {
    listId?: string
    includeClosed?: boolean
    page?: number
  } = {},
): Promise<ClickUpTask[] | ClickUpError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No ClickUp credentials configured' }
    if (!config.listId) return { error: 'listId is required' }

    const params = new URLSearchParams()
    if (config.includeClosed !== undefined) {
      params.set('include_closed', String(config.includeClosed))
    }
    if (config.page !== undefined) {
      params.set('page', String(config.page))
    }

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const data = await clickUpFetch<{ tasks: ClickUpTask[] }>(
      token,
      `/list/${config.listId}/task${suffix}`,
    )
    return data.tasks
  } catch (err) {
    return { error: 'Failed to fetch tasks', details: String(err) }
  }
}

export async function createClickUpTask(
  client: SupabaseClient,
  orgId: string,
  listId: string,
  data: ClickUpCreateTaskData,
): Promise<ClickUpTask | ClickUpError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No ClickUp credentials configured' }

    return await clickUpFetch<ClickUpTask>(token, `/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  } catch (err) {
    return { error: 'Failed to create task', details: String(err) }
  }
}

export async function updateClickUpTask(
  client: SupabaseClient,
  orgId: string,
  taskId: string,
  data: ClickUpUpdateTaskData,
): Promise<ClickUpTask | ClickUpError> {
  try {
    const token = await resolveToken(client, orgId)
    if (!token) return { error: 'No ClickUp credentials configured' }

    return await clickUpFetch<ClickUpTask>(token, `/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  } catch (err) {
    return { error: 'Failed to update task', details: String(err) }
  }
}

export function handleClickUpWebhook(
  body: Partial<ClickUpWebhookEvent> | null | undefined,
): ClickUpWebhookEvent | ClickUpError {
  try {
    if (!body?.event) return { error: 'Invalid webhook payload: missing event' }

    return {
      event: body.event,
      task_id: body.task_id,
      webhook_id: body.webhook_id,
      history_items: body.history_items,
    }
  } catch (err) {
    return { error: 'Failed to parse webhook payload', details: String(err) }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const clickupAdapter: ChannelAdapter = {
  type: 'clickup',
  name: 'ClickUp',
  description: 'Sync tasks from ClickUp lists',
  icon: 'ListTodo',

  async pull(config, since) {
    const token = process.env.CLICKUP_ACCESS_TOKEN || process.env.CLICKUP_PAT
    if (!token) return []

    const listId = (config.listId as string | undefined) || process.env.CLICKUP_LIST_ID
    if (!listId) {
      console.error('[clickup] No listId in config or CLICKUP_LIST_ID env')
      return []
    }

    try {
      const params = new URLSearchParams({ include_closed: 'true' })
      if (since) params.set('date_updated_gt', String(since.getTime()))

      const data = await clickUpFetch<{ tasks: ClickUpTask[] }>(
        token,
        `/list/${listId}/task?${params.toString()}`,
      )

      return data.tasks.map((task): ChannelMessage => {
        const primaryAssignee = task.assignees[0]

        return {
          id: `clickup-${task.id}`,
          channel: 'clickup',
          externalId: task.id,
          sender: primaryAssignee?.username || 'ClickUp',
          subject: task.name,
          body: task.description || task.name,
          receivedAt: parseClickUpDate(task.date_updated || task.date_created),
          isActionable: isTaskOpen(task),
          priority: mapClickUpPriority(task),
          metadata: {
            status: task.status.name,
            statusColor: task.status.color,
            due_date: task.due_date,
            list: task.list,
            space: task.space,
            tags: task.tags || [],
          },
        }
      })
    } catch (err) {
      console.error('[clickup] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.CLICKUP_ACCESS_TOKEN || process.env.CLICKUP_PAT)
  },
}

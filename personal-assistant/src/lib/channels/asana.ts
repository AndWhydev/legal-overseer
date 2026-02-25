import type { ChannelAdapter, ChannelMessage } from './types'

const ASANA_API_BASE = 'https://app.asana.com/api/1.0'

interface AsanaTask {
  gid: string
  name: string
  notes: string
  modified_at: string
  created_at: string
  assignee?: { name: string; email?: string } | null
  projects?: { gid: string; name: string }[]
  workspace?: { gid: string; name: string }
}

interface AsanaResponse<T> {
  data: T
  next_page?: { offset: string; path: string; uri: string } | null
}

function getHeaders(): HeadersInit {
  const pat = process.env.ASANA_PAT
  if (!pat) throw new Error('ASANA_PAT env var not set')
  return {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

async function fetchTasks(workspaceGid: string, since?: Date): Promise<AsanaTask[]> {
  const params = new URLSearchParams({
    workspace: workspaceGid,
    opt_fields: 'gid,name,notes,modified_at,created_at,assignee.name,assignee.email,projects.name',
    limit: '100',
  })

  if (since) {
    params.set('modified_since', since.toISOString())
  }

  const tasks: AsanaTask[] = []
  let url: string | null = `${ASANA_API_BASE}/tasks?${params.toString()}`

  while (url) {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Asana GET /tasks failed: ${res.status} ${text}`)
    }
    const json: AsanaResponse<AsanaTask[]> = await res.json()
    tasks.push(...json.data)
    url = json.next_page ? `${ASANA_API_BASE}${json.next_page.path}` : null
  }

  return tasks
}

export const asanaAdapter: ChannelAdapter = {
  type: 'asana',
  name: 'Asana',
  description: 'Pull tasks from Asana workspace',
  icon: 'CheckSquare',

  async pull(config, since) {
    const pat = process.env.ASANA_PAT
    if (!pat) return []

    const workspaceGid = (config.workspaceGid as string | undefined) || process.env.ASANA_WORKSPACE_GID
    if (!workspaceGid) {
      console.error('[asana] No workspaceGid in config or ASANA_WORKSPACE_GID env')
      return []
    }

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    try {
      const tasks = await fetchTasks(workspaceGid, sinceDate)

      return tasks.map((task): ChannelMessage => {
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
          receivedAt: new Date(task.modified_at || task.created_at),
          isActionable: true,
          priority: 'medium',
          metadata: {
            gid: task.gid,
            projectGid: project?.gid,
            projectName: project?.name,
            workspaceGid,
            modifiedAt: task.modified_at,
            createdAt: task.created_at,
          },
        }
      })
    } catch (err) {
      console.error('[asana] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.ASANA_PAT)
  },
}

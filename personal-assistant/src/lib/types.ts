export interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  settings: Record<string, unknown>
}

export interface Profile {
  id: string
  org_id: string
  display_name: string | null
  role: string
  preferences: Record<string, unknown>
}

export interface KanbanColumn {
  id: string
  org_id: string
  title: string
  color: string
  position: number
}

export interface Task {
  id: string
  org_id: string
  title: string
  description: string | null
  status: string
  priority: string
  column_id: string | null
  position: number
  assigned_to: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  org_id: string
  slug: string
  name: string
  type: string
  emails: string[]
  phones: string[]
  aliases: string[]
  profile_data: Record<string, unknown>
  communication_patterns: Record<string, unknown>
}

export interface Goal {
  id: string
  org_id: string
  description: string
  priority: string
  status: string
  target_date: string | null
}

export interface MemoryEntry {
  id: string
  org_id: string
  category: string
  content: string
  confidence: number
}

export interface ActivityEntry {
  id: string
  org_id: string
  action_type: string
  action: string
  reasoning: string | null
  result: string | null
  user_confirmed: boolean
  created_at: string
}

export interface AgentSession {
  id: string
  org_id: string
  task_id: string | null
  status: string
  model: string
  messages: unknown[]
  tokens_used: number
}

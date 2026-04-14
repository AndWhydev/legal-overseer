import {
  IconArrowsTransferUpDown,
  IconBinaryTree2,
  IconBolt,
  IconBrain,
  IconBrandGithub,
  IconChecklist,
  IconMessage,
  IconReceipt,
  IconSearch,
  IconShieldCheck,
  IconTool,
  IconUsers,
  IconWorld,
  IconCamera,
  IconCode,
} from '@tabler/icons-react'

export type AgentToolCallStatus = 'running' | 'done' | 'error'

export interface AgentToolCall {
  id?: string
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: AgentToolCallStatus
  elapsedMs?: number
}

export interface ToolCallEntry {
  tool_name: string
  tool_category: string
  message?: string
  show_category?: boolean
  tool_call_id?: string
  inputs?: Record<string, unknown>
  output?: string
  icon_url?: string
  integration_name?: string
  status?: AgentToolCallStatus
  elapsed_ms?: number
  result_summary?: string
}

export interface IntegrationInfo {
  iconUrl?: string
  name?: string
}

const TOOL_PAYLOAD_CHAR_LIMIT = 1400

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  add_memory: 'Saving to memory',
  spawn_browser_agent: 'Launching browser',
  fetch_url: 'Fetching page',
  send_image: 'Sending image',
  compose_creator_notification_mockup: 'Composing notification',
  create_invoice: 'Creating invoice',
  create_task: 'Creating task',
  draft_reply: 'Drafting reply',
  find_messages: 'Searching messages',
  generate_invoice: 'Generating invoice',
  get_calendar: 'Checking calendar',
  get_contact: 'Looking up contact',
  log_activity: 'Logging activity',
  read_message: 'Reading message',
  search_contacts: 'Searching contacts',
  search_leads: 'Searching leads',
  search_memory: 'Searching memory',
  search_tasks: 'Searching tasks',
  send_email: 'Sending email',
  update_lead: 'Updating lead',
  update_task: 'Updating task',
  web_search: 'Searching the web',
  web_read: 'Reading page',
  web_extract: 'Extracting data',
  web_crawl: 'Crawling site',
  generate_image: 'Generating image',
  generate_images: 'Generating images',
  execute_code: 'Running code',
  get_upcoming: 'Checking schedule',
  schedule_event: 'Scheduling event',
  create_reminder: 'Setting reminder',
  spawn_agent: 'Delegating sub-task',
  resolve_tool: 'Loading tools',
}

const TOOL_CATEGORY_OVERRIDES: Record<string, string> = {
  add_memory: 'memory',
  spawn_browser_agent: 'web',
  fetch_url: 'web',
  send_image: 'communication',
  compose_creator_notification_mockup: 'gmail',
  create_event: 'google_calendar',
  create_invoice: 'finance',
  create_task: 'tasks',
  draft_reply: 'gmail',
  executor: 'executor',
  find_messages: 'search',
  generate_invoice: 'finance',
  get_calendar: 'google_calendar',
  get_contact: 'people',
  handoff: 'handoff',
  log_activity: 'automation',
  read_message: 'gmail',
  resolve_tool: 'retrieve_tools',
  retrieve_tools: 'retrieve_tools',
  schedule_event: 'google_calendar',
  search_contacts: 'people',
  search_leads: 'people',
  search_memory: 'memory',
  search_tasks: 'tasks',
  send_email: 'gmail',
  send_gmail: 'gmail',
  send_outlook: 'gmail',
  send_slack: 'communication',
  send_sms: 'communication',
  send_whatsapp: 'communication',
  spawn_agent: 'handoff',
  sub_agent_complete: 'handoff',
  sub_agent_start: 'handoff',
  update_lead: 'people',
  update_task: 'tasks',
  web_search: 'web',
  web_read: 'web',
  web_extract: 'web',
  web_crawl: 'web',
  generate_image: 'creative',
  generate_images: 'creative',
  execute_code: 'executor',
}

const CATEGORY_LABELS: Record<string, string> = {
  approval: 'Approval',
  automation: 'Automation',
  communication: 'Comms',
  executor: 'Executor',
  finance: 'Finance',
  gmail: 'Gmail',
  github: 'GitHub',
  google_calendar: 'Google Calendar',
  handoff: 'Handoff',
  memory: 'Memory',
  people: 'People',
  retrieve_tools: 'Tool Loader',
  search: 'Search',
  tasks: 'Tasks',
  web: 'Web',
}

const CATEGORY_INTEGRATIONS: Record<string, string | undefined> = {
  communication: 'Channels',
  finance: 'Finance',
  gmail: 'Gmail',
  github: 'GitHub',
  google_calendar: 'Google Calendar',
  memory: 'Memory',
}

/** Iconify icon IDs for brand-colored categories (rendered via @iconify/react) */
export const BRANDED_ICON_MAP: Record<string, string> = {
  gmail: 'logos:google-gmail',
  google_calendar: 'logos:google-calendar',
  github: 'logos:github-icon',
  communication: 'logos:whatsapp-icon',
  finance: 'logos:stripe',
  creative: 'logos:google-photos',
}

/** Fallback Tabler icons for non-branded categories */
const CATEGORY_ICON_MAP = {
  approval: IconShieldCheck,
  automation: IconTool,
  communication: IconMessage,
  executor: IconCode,
  finance: IconReceipt,
  gmail: IconSearch,       // fallback if Iconify not available
  github: IconBrandGithub,
  google_calendar: IconSearch,
  creative: IconCamera,
  handoff: IconArrowsTransferUpDown,
  memory: IconBrain,
  people: IconUsers,
  retrieve_tools: IconBinaryTree2,
  search: IconSearch,
  tasks: IconChecklist,
  web: IconWorld,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

export function formatToolName(name: string): string {
  if (TOOL_DISPLAY_NAMES[name]) return TOOL_DISPLAY_NAMES[name]

  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function getToolCallCategory(name: string): string {
  if (TOOL_CATEGORY_OVERRIDES[name]) return TOOL_CATEGORY_OVERRIDES[name]

  if (name.includes('github') || name.includes('repo') || name.includes('issue') || name.includes('pull_request')) {
    return 'github'
  }

  if (name.startsWith('search') || name.startsWith('find')) return 'search'
  if (name.startsWith('browse') || name.includes('website') || name.includes('url') || name.includes('web')) return 'web'
  if (name.includes('calendar') || name.includes('event') || name.includes('meeting') || name.includes('schedule')) return 'google_calendar'
  if (name.includes('email') || name.includes('mail') || name.includes('reply')) return 'gmail'
  if (name.includes('memory')) return 'memory'
  if (name.includes('task')) return 'tasks'
  if (name.includes('contact') || name.includes('lead') || name.includes('user') || name.includes('people')) return 'people'
  if (name.includes('invoice') || name.includes('payment') || name.includes('receipt') || name.includes('finance')) return 'finance'
  if (name.includes('handoff') || name.includes('agent')) return 'handoff'
  if (name.includes('approve') || name.includes('approval')) return 'approval'
  if (name.includes('sms') || name.includes('whatsapp') || name.includes('slack') || name.includes('message')) return 'communication'

  return 'automation'
}

export function getToolCategoryLabel(category: string): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]

  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function getToolCallIntegrationName(category: string): string | undefined {
  return CATEGORY_INTEGRATIONS[category]
}

export function getToolCategoryIcon(category: string) {
  return CATEGORY_ICON_MAP[category as keyof typeof CATEGORY_ICON_MAP] ?? IconBolt
}

export function getToolCallIcon(name: string) {
  return getToolCategoryIcon(getToolCallCategory(name))
}

export function extractToolDetail(name: string, input: unknown, result?: unknown): string | null {
  const inp = isRecord(input) ? input : {}
  const res = isRecord(result) ? result : {}

  if (['search_tasks', 'search_contacts', 'search_leads', 'find_messages', 'search_memory'].includes(name)) {
    const query = inp.query || inp.search || inp.keyword || inp.q || inp.name
    if (typeof query === 'string' && query.length > 0) return truncate(query, 60)
  }

  if (name === 'read_message') {
    const subject = res.subject
    if (typeof subject === 'string' && subject.length > 0) return truncate(subject, 50)

    const sender = res.sender || res.sender_name || res.from
    if (typeof sender === 'string' && sender.length > 0) return truncate(sender, 40)

    const inputSubject = inp.subject
    if (typeof inputSubject === 'string' && inputSubject.length > 0) return truncate(inputSubject, 50)
    return null
  }

  if (name === 'get_contact') {
    const contactName = inp.name || inp.contact_name
    if (typeof contactName === 'string' && contactName.length > 0) return contactName
  }

  if (name === 'send_email' || name === 'send_gmail' || name === 'send_outlook') {
    const to = inp.to || inp.recipient
    if (typeof to === 'string' && to.length > 0) return `to ${to}`
  }

  if (name === 'create_task') {
    const title = inp.title
    if (typeof title === 'string' && title.length > 0) return truncate(title, 60)
  }

  if (name === 'add_memory') {
    const key = inp.key || inp.title || inp.category
    if (typeof key === 'string' && key.length > 0) return truncate(key, 50)

    const content = inp.content || inp.text || inp.value
    if (typeof content === 'string' && content.length > 0) return truncate(content, 50)
  }

  if (name === 'spawn_browser_agent') {
    const instruction = inp.instruction
    if (typeof instruction === 'string' && instruction.length > 0) return truncate(instruction, 50)
    const url = inp.start_url
    if (typeof url === 'string' && url.length > 0) {
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }
  }

  if (name === 'fetch_url') {
    const url = inp.url || inp.href
    if (typeof url === 'string' && url.length > 0) {
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }
  }

  if (name === 'send_image') {
    const to = inp.to as string
    if (typeof to === 'string' && to.length > 0) return `to ${to}`
  }

  if (name === 'web_search') {
    const query = inp.query || inp.q
    if (typeof query === 'string' && query.length > 0) return truncate(query, 35)
  }

  if (name === 'web_read' || name === 'web_extract') {
    const url = inp.url as string
    if (typeof url === 'string' && url.length > 0) {
      try {
        return new URL(url).hostname
      } catch {
        return truncate(url.replace(/^https?:\/\//, ''), 40)
      }
    }
  }

  if (name === 'web_crawl') {
    const url = inp.url as string
    const resData = isRecord(result) ? result : {}
    const pageCount = Array.isArray(resData.pages) ? resData.pages.length : null
    if (typeof url === 'string' && url.length > 0) {
      try {
        const domain = new URL(url).hostname
        return pageCount ? `${domain} · ${pageCount} pages` : domain
      } catch {
        return truncate(url.replace(/^https?:\/\//, ''), 40)
      }
    }
  }

  return null
}

export function extractResultSummary(name: string, result?: unknown, success?: boolean): string | null {
  if (success === false) return 'Failed'
  if (typeof result === 'undefined' || result === null) return null

  if (Array.isArray(result)) {
    return result.length === 0 ? 'No results' : `Found ${result.length} result${result.length !== 1 ? 's' : ''}`
  }

  const res = isRecord(result) ? result : {}

  if (Array.isArray(res.data)) {
    const count = res.data.length
    return count === 0 ? 'No results' : `Found ${count} result${count !== 1 ? 's' : ''}`
  }

  if (Array.isArray(res.results)) {
    const count = res.results.length
    return count === 0 ? 'No results' : `Found ${count} result${count !== 1 ? 's' : ''}`
  }

  if (typeof res.count === 'number') {
    return res.count === 0 ? 'No results' : `Found ${res.count} result${res.count !== 1 ? 's' : ''}`
  }

  if (name === 'send_email' || name === 'send_outlook' || name === 'send_gmail') return 'Sent'
  if (name === 'create_task') return 'Created'
  if (name === 'update_task' || name === 'update_lead') return 'Updated'
  if (name === 'add_memory') return 'Saved'
  if (name === 'log_activity') return 'Logged'
  if (name === 'create_invoice') return 'Invoice created'
  if (name === 'draft_reply') return 'Draft ready'
  if (name === 'read_message' || name === 'get_contact') return 'Done'
  if (name === 'spawn_browser_agent') return 'Browser done'
  if (name === 'fetch_url') return 'Page loaded'
  if (name === 'send_image') return 'Image sent'
  if (name === 'get_calendar' || name === 'schedule_event' || name === 'get_upcoming') return 'Done'
  if (name === 'web_search') {
    if (Array.isArray(res.results)) {
      return `${(res.results as unknown[]).length} result${(res.results as unknown[]).length !== 1 ? 's' : ''}`
    }
  }
  if (name === 'web_read') return 'Page loaded'
  if (name === 'web_extract') return 'Data extracted'
  if (name === 'web_crawl') {
    if (Array.isArray(res.pages)) {
      return `${(res.pages as unknown[]).length} page${(res.pages as unknown[]).length !== 1 ? 's' : ''} read`
    }
    return 'Done'
  }
  if (success === true) return 'Done'

  return null
}

export function stringifyToolCallContent(content: unknown): string | undefined {
  if (typeof content === 'undefined' || content === null) return undefined

  if (typeof content === 'string') return truncate(content, TOOL_PAYLOAD_CHAR_LIMIT)

  try {
    return truncate(JSON.stringify(content, null, 2), TOOL_PAYLOAD_CHAR_LIMIT)
  } catch {
    return truncate(String(content), TOOL_PAYLOAD_CHAR_LIMIT)
  }
}

export function normalizeToolCallEntry(call: AgentToolCall, index: number): ToolCallEntry {
  const category = getToolCallCategory(call.name)
  const detail = extractToolDetail(call.name, call.input, call.result)
  const integrationName = getToolCallIntegrationName(category)

  return {
    tool_name: call.name,
    tool_category: category,
    message: detail ? `${formatToolName(call.name)}${detail.startsWith('to ') ? ' ' : ': '}${detail}` : formatToolName(call.name),
    show_category: !['executor', 'handoff', 'retrieve_tools'].includes(category),
    tool_call_id: call.id || `${call.name}-${index}`,
    inputs: isRecord(call.input) ? call.input : typeof call.input === 'undefined' ? undefined : { value: call.input },
    output: stringifyToolCallContent(call.result),
    integration_name: integrationName,
    status: call.status,
    elapsed_ms: call.elapsedMs,
    result_summary: extractResultSummary(call.name, call.result, call.success) ?? undefined,
  }
}

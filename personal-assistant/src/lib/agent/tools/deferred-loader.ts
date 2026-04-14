import type Anthropic from '@anthropic-ai/sdk'
import { getAgentTools, TOOL_GROUP_MAP, type ToolGroup } from '../tools'

// Groups always loaded (essential for every conversation)
const EAGER_GROUPS: Set<ToolGroup> = new Set(['core', 'memory', 'channel'])

// Additional tools always eager regardless of group
const EAGER_TOOL_NAMES: Set<string> = new Set([
  'web_search', 'web_read', 'web_extract', 'web_crawl',
  'fetch_url', 'browse_website',
  'execute_code', 'approve_action', 'spawn_agent',
  'send_email', 'send_sms', 'send_whatsapp', 'send_imessage',
])

let allToolsCache: Anthropic.Tool[] | null = null

function getAllTools(): Anthropic.Tool[] {
  if (!allToolsCache) allToolsCache = getAgentTools()
  return allToolsCache
}

/** Core + memory + channel + high-frequency tools (always loaded) */
export function getEagerTools(): Anthropic.Tool[] {
  return getAllTools().filter(t => {
    const group = TOOL_GROUP_MAP[t.name]
    return EAGER_GROUPS.has(group) || EAGER_TOOL_NAMES.has(t.name)
  })
}

/** Names of tools available for on-demand loading */
export function getDeferredToolNames(): string[] {
  const eager = new Set(getEagerTools().map(t => t.name))
  return getAllTools()
    .filter(t => !eager.has(t.name))
    .map(t => t.name)
}

/** Resolve a deferred tool schema by exact name */
export function resolveToolSchema(name: string): Anthropic.Tool | undefined {
  return getAllTools().find(t => t.name === name)
}

/** Search deferred tools by keyword, return top N */
export function searchToolSchemas(query: string, maxResults: number = 3): Anthropic.Tool[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  const eagerNames = new Set(getEagerTools().map(t => t.name))
  const deferred = getAllTools().filter(t => !eagerNames.has(t.name))

  const scored = deferred.map(tool => {
    const text = `${tool.name.replace(/_/g, ' ')} ${tool.description || ''}`.toLowerCase()
    const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0)
    return { tool, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.tool)
}

/**
 * System prompt section listing deferred tools by name.
 * ~100 tokens instead of ~6,000 for full schemas.
 */
export function buildDeferredToolsPrompt(): string {
  const names = getDeferredToolNames()
  if (names.length === 0) return ''

  return `\n## Additional Tools (On-Demand)\nThese tools are available but not loaded. Use resolve_tool to load one when needed:\n${names.join(', ')}\n`
}

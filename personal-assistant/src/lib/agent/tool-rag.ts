/**
 * Tool RAG — Dynamic tool selection based on message relevance
 *
 * Reduces the number of tools exposed to the model per query by scoring
 * each tool's relevance to the user's message. This cuts token overhead
 * from tool definitions (each tool schema costs ~150-300 tokens) and
 * reduces model confusion from irrelevant options.
 *
 * Scoring approach:
 *   1. Tokenize message into lowercase words
 *   2. Score each tool by keyword overlap with name + description
 *   3. Boost tools whose names appear in the message (direct intent match)
 *   4. Always include core group tools (essential for every conversation)
 *   5. Return top N tools sorted by relevance
 */

import type Anthropic from '@anthropic-ai/sdk'
import { TOOL_GROUP_MAP } from './tools'

// ---------------------------------------------------------------------------
// Stop words — common words that add noise to keyword scoring
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'and',
  'or', 'but', 'not', 'with', 'this', 'that', 'from', 'by', 'at', 'as',
  'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'can', 'may', 'i', 'my',
  'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'its',
  'what', 'when', 'where', 'how', 'who', 'which', 'if', 'then', 'so',
  'up', 'out', 'about', 'just', 'get', 'got', 'also', 'some', 'any',
  'all', 'very', 'too', 'more', 'most', 'much', 'many', 'than', 'no',
  'yes', 'please', 'thanks', 'hi', 'hey', 'hello',
])

// ---------------------------------------------------------------------------
// Intent keywords — high-signal words that map directly to tool domains
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: Record<string, string[]> = {
  // Comms & channel tools
  send_email: ['email', 'mail', 'send', 'message', 'write', 'compose', 'draft', 'reply', 'respond'],
  send_gmail: ['gmail', 'google', 'email', 'mail', 'send'],
  send_outlook: ['outlook', 'microsoft', 'email', 'mail', 'send', 'office'],
  send_sms: ['sms', 'text', 'message', 'phone', 'send'],
  send_whatsapp: ['whatsapp', 'wa', 'message', 'send'],
  draft_reply: ['draft', 'reply', 'respond', 'compose', 'write'],

  // Channel tools
  find_messages: ['messages', 'emails', 'inbox', 'check', 'find', 'search', 'recent', 'unread', 'new', 'correspondence'],
  read_message: ['read', 'open', 'view', 'full', 'message', 'email'],
  summarize_inbox: ['summary', 'summarize', 'digest', 'inbox', 'overview', 'briefing', 'catch'],
  get_upcoming: ['calendar', 'schedule', 'upcoming', 'meetings', 'events', 'agenda', 'due', 'week', 'today', 'tomorrow'],
  create_reminder: ['reminder', 'remind', 'alert', 'notify', 'alarm'],
  schedule_event: ['schedule', 'meeting', 'event', 'book', 'calendar', 'appointment', 'block'],

  // Web tools
  web_search: ['search', 'google', 'look', 'find', 'research', 'web', 'online', 'latest', 'current', 'news'],
  fetch_url: ['url', 'link', 'website', 'page', 'fetch', 'read', 'open', 'http', 'https'],
  browse_website: ['browse', 'website', 'navigate', 'screenshot', 'render', 'page'],

  // Task tools
  create_task: ['task', 'todo', 'add', 'create', 'new', 'action', 'item', 'kanban'],
  update_task: ['update', 'change', 'move', 'complete', 'done', 'finish', 'archive', 'task', 'status'],
  search_tasks: ['tasks', 'board', 'kanban', 'pending', 'backlog', 'progress'],

  // Contact tools
  search_contacts: ['contact', 'person', 'people', 'who', 'client', 'customer', 'name'],
  get_contact: ['contact', 'profile', 'history', 'relationship', 'about'],

  // Memory tools
  search_memory: ['remember', 'recall', 'past', 'before', 'previously', 'history', 'memory', 'mentioned', 'said', 'told'],
  add_memory: ['remember', 'note', 'store', 'save', 'learn', 'preference', 'always', 'never', 'prefer'],

  // Activity
  log_activity: ['log', 'record', 'track', 'activity'],

  // Approvals
  approve_action: ['approve', 'confirm', 'yes', 'go', 'proceed', 'ahead', 'accept', 'pending'],

  // Agentic
  execute_code: ['code', 'run', 'execute', 'query', 'data', 'calculate', 'compute', 'analyze', 'script', 'sdk'],

  // Creator studio
  compose_creator_notification_mockup: ['mockup', 'creator', 'notification', 'preview', 'studio', 'demo'],
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export interface ToolRAGResult {
  /** Selected tools to pass to the model */
  tools: Anthropic.Tool[]
  /** Excluded tool names */
  excluded: string[]
  /** Compact summary of excluded tools for the system prompt */
  toolSummary: string
  /** Scoring details for observability */
  scores: Record<string, number>
}

/**
 * Score and select the most relevant tools for a given user message.
 *
 * @param message   - The user's message text
 * @param allTools  - Full set of available tools (already group-filtered)
 * @param maxTools  - Maximum number of tools to return (default: 12)
 */
export function selectRelevantTools(
  message: string,
  allTools: Anthropic.Tool[],
  maxTools: number = 12,
): ToolRAGResult {
  // If we already have fewer tools than the limit, skip filtering
  if (allTools.length <= maxTools) {
    return {
      tools: allTools,
      excluded: [],
      toolSummary: '',
      scores: Object.fromEntries(allTools.map(t => [t.name, 1])),
    }
  }

  const messageWords = tokenize(message)
  const messageWordSet = new Set(messageWords)
  const messageLower = message.toLowerCase()

  const scores: Record<string, number> = {}
  const coreTools: Anthropic.Tool[] = []
  const scoredTools: Array<{ tool: Anthropic.Tool; score: number }> = []

  for (const tool of allTools) {
    const group = TOOL_GROUP_MAP[tool.name]

    // Core tools + memory search are always included — essential for every conversation
    if (group === 'core' || tool.name === 'search_memory' || tool.name === 'find_messages') {
      coreTools.push(tool)
      scores[tool.name] = Infinity
      continue
    }

    const score = scoreTool(tool, messageWords, messageWordSet, messageLower)
    scores[tool.name] = score
    scoredTools.push({ tool, score })
  }

  // Sort by score descending
  scoredTools.sort((a, b) => b.score - a.score)

  // Take top N after reserving space for core tools
  const remainingSlots = Math.max(0, maxTools - coreTools.length)
  const selected = scoredTools.slice(0, remainingSlots)
  const excluded = scoredTools.slice(remainingSlots)

  const selectedTools = [...coreTools, ...selected.map(s => s.tool)]
  const excludedNames = excluded.map(e => e.tool.name)

  // Build compact summary of excluded tools
  const toolSummary = excludedNames.length > 0
    ? `Also available but not loaded: ${excludedNames.join(', ')}`
    : ''

  return {
    tools: selectedTools,
    excluded: excludedNames,
    toolSummary,
    scores,
  }
}

// ---------------------------------------------------------------------------
// Scoring internals
// ---------------------------------------------------------------------------

function scoreTool(
  tool: Anthropic.Tool,
  messageWords: string[],
  messageWordSet: Set<string>,
  messageLower: string,
): number {
  let score = 0

  // 1. Tool name match — strong signal (name parts in the message)
  const nameWords = tool.name.split('_')
  for (const word of nameWords) {
    if (messageLower.includes(word)) {
      score += 3
    }
  }

  // 2. Exact tool name mention (e.g., user says "send email" → "send_email")
  // Check both underscore and space variants
  if (messageLower.includes(tool.name) || messageLower.includes(tool.name.replace(/_/g, ' '))) {
    score += 5
  }

  // 3. Intent keyword matching — domain-specific signals
  const intentWords = INTENT_KEYWORDS[tool.name]
  if (intentWords) {
    for (const keyword of intentWords) {
      if (messageWordSet.has(keyword) || messageLower.includes(keyword)) {
        score += 2
      }
    }
  }

  // 4. Description keyword overlap — weaker signal
  const descriptionWords = tokenize(tool.description || '')
  let descOverlap = 0
  for (const word of descriptionWords) {
    if (messageWordSet.has(word)) {
      descOverlap++
    }
  }
  // Normalize by description length to avoid biasing toward verbose descriptions
  if (descriptionWords.length > 0) {
    score += (descOverlap / descriptionWords.length) * 2
  }

  // 5. Bigram matching — "send email", "web search", etc.
  if (messageWords.length >= 2) {
    const nameBigram = tool.name.replace(/_/g, ' ')
    for (let i = 0; i < messageWords.length - 1; i++) {
      const bigram = `${messageWords[i]} ${messageWords[i + 1]}`
      if (nameBigram.includes(bigram)) {
        score += 4
      }
    }
  }

  return score
}

/**
 * Tokenize text into lowercase words, filtering out stop words and short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

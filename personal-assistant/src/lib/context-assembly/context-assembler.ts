/**
 * Context Assembly Pipeline — Total Recall
 *
 * Assembles all context tiers into a single object for the Anthropic API:
 *   Tier 1: System prompt (identity, guidelines, current state)
 *   Tier 2: Session history (verbatim + compressed + key facts)
 *   Tier 3: Entity context (baseplate snapshots for mentioned contacts)
 *   Tier 4: Action state (pending approvals)
 *
 * Target: <200ms total assembly latency.
 * Strategy: parallel fetch with graceful per-tier degradation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Anthropic from '@anthropic-ai/sdk'
import type {
  TokenAllocation,
  ConversationMessageRecord,
  ThreadSummaryRecord,
  KeyFact,
} from '@/lib/conversation/types'
import { buildEntityAwarePrompt, type UserProfile } from '@/lib/agent/prompt-builder'
import { getPendingApprovals, type ApprovalRecord } from '@/lib/agent/approval-queue'
import { loadRecentMessages, loadThreadSummaries } from '@/lib/conversation/thread-resolver'
import { scanForEntityMentions } from '@/lib/context/entity-mention-scanner'
import { TokenBudgetManager, type TierInput } from './token-budget-manager'
import { proactiveRecall as recallForContext, type ProactiveRecallResult } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

const MESSAGE_OVERHEAD_TOKENS = 4 // role + formatting overhead per message

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AssemblerConfig {
  tokenBudget: number
  maxRecentTurns: number
  maxCompressedTurns: number
  maxEntities: number
  systemPromptCacheTtlMs: number
  includePendingActions: boolean
  includeCompressedHistory: boolean
}

export const DEFAULT_ASSEMBLER_CONFIG: AssemblerConfig = {
  tokenBudget: 48000,
  maxRecentTurns: 20,
  maxCompressedTurns: 40,
  maxEntities: 5,
  systemPromptCacheTtlMs: 300_000,
  includePendingActions: true,
  includeCompressedHistory: true,
}

export interface TierStatus {
  tier: 'working' | 'session_history' | 'compiled_memory' | 'action_state' | 'retrieved_context'
  loaded: boolean
  latencyMs: number
  tokenCount: number
  error?: string
}

export interface AssembledContext {
  systemPrompt: string
  messageHistory: Anthropic.MessageParam[]
  metadata: {
    tokenUsage: TokenAllocation
    tiersLoaded: TierStatus[]
    assemblyMs: number
    entityMentions: string[]
    pendingActionCount: number
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface TierResult<T> {
  data: T | null
  loaded: boolean
  latencyMs: number
  error?: string
}

async function timedFetch<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<TierResult<T>> {
  const start = performance.now()
  try {
    const data = await fn()
    return {
      data,
      loaded: true,
      latencyMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start)
    logger.error(`[context-assembler] ${label} fetch failed`, {
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      data: null,
      loaded: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Format pending approvals into a system prompt section.
 */
function formatPendingActionsSection(approvals: ApprovalRecord[]): string {
  if (approvals.length === 0) return ''

  const lines: string[] = [
    '## Pending Actions',
    '',
    `You have ${approvals.length} action${approvals.length === 1 ? '' : 's'} awaiting approval:`,
    '',
  ]

  for (let i = 0; i < approvals.length; i++) {
    const a = approvals[i]
    const confidence = Math.round(a.confidence_score * 100)
    const ago = formatRelativeTime(a.created_at)
    const agent = a.agent_name ?? 'Agent'

    lines.push(
      `${i + 1}. [PENDING] ${a.action_summary}`,
      `   Approval ID: ${a.id} | Agent: ${agent} | Confidence: ${confidence}% | Queued: ${ago}`,
    )

    // Include truncated payload preview if available
    if (a.action_payload) {
      const preview = JSON.stringify(a.action_payload)
      if (preview.length > 2 && preview !== '{}') {
        const truncated = preview.length > 200 ? preview.slice(0, 197) + '...' : preview
        lines.push(`   Preview: ${truncated}`)
      }
    }

    lines.push('')
  }

  lines.push(
    'If the user confirms (e.g., "yes", "send it", "approve"), resolve the most recent pending action.',
  )

  return lines.join('\n')
}

/**
 * Format key facts into a conversation preamble.
 */
function formatKeyFactsPreamble(summaries: ThreadSummaryRecord[]): string {
  const facts: KeyFact[] = []
  for (const summary of summaries) {
    if (summary.tier === 'key_facts' && summary.key_facts.length > 0) {
      facts.push(...summary.key_facts)
    }
  }

  if (facts.length === 0) return ''

  // Deduplicate by text and sort by confidence
  const seen = new Set<string>()
  const unique = facts
    .sort((a, b) => b.confidence - a.confidence)
    .filter((f) => {
      if (seen.has(f.text)) return false
      seen.add(f.text)
      return true
    })

  return unique.map((f) => `- ${f.text}`).join('\n')
}

/**
 * Format compressed summaries into conversation preamble messages.
 */
function formatCompressedSummaries(summaries: ThreadSummaryRecord[]): string {
  const compressed = summaries
    .filter((s) => s.tier === 'compressed')
    .sort((a, b) => a.turn_range_start - b.turn_range_start)

  if (compressed.length === 0) return ''

  return compressed
    .map((s) => `[Turns ${s.turn_range_start}-${s.turn_range_end}] ${s.summary_text}`)
    .join('\n\n')
}

/**
 * Convert a ConversationMessageRecord to an Anthropic MessageParam.
 *
 * Mapping:
 *   role 'user'        → { role: 'user', content: text }
 *   role 'assistant'   → { role: 'assistant', content: text }
 *   role 'tool_call'   → { role: 'assistant', content: [{ type: 'tool_use', ... }] }
 *   role 'tool_result' → { role: 'user', content: [{ type: 'tool_result', ... }] }
 *   role 'system'      → folded into adjacent user message (Anthropic API has no system role in messages)
 */
function convertToMessageParam(msg: ConversationMessageRecord): Anthropic.MessageParam | null {
  switch (msg.role) {
    case 'user':
      return { role: 'user', content: msg.content }

    case 'assistant':
      return { role: 'assistant', content: msg.content }

    case 'tool_call': {
      if (!msg.tool_data) {
        return { role: 'assistant', content: msg.content }
      }
      return {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: msg.id, // use message ID as tool_use ID
            name: msg.tool_data.name,
            input: msg.tool_data.input ?? {},
          },
        ],
      } as Anthropic.MessageParam
    }

    case 'tool_result': {
      if (!msg.tool_data) {
        return { role: 'user', content: msg.content }
      }
      // Find the associated tool_call message ID for tool_use_id.
      // We use the content field which should store the tool_call message ID,
      // or fall back to the message ID.
      const toolUseId = (msg.metadata?.tool_call_message_id as string) ?? msg.id
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: msg.content,
          },
        ],
      } as Anthropic.MessageParam
    }

    case 'system':
      // System messages are folded into adjacent user messages or dropped
      return null

    default:
      return null
  }
}

/**
 * Build the message history array from stored messages, compressed summaries,
 * and key facts, in the correct Anthropic API format.
 *
 * Structure (oldest first):
 *   1. Key facts preamble (synthetic user/assistant pair)
 *   2. Compressed history (synthetic user/assistant pair)
 *   3. Verbatim recent messages (converted from DB records)
 *   4. Current user message
 */
function buildMessageHistory(
  recentMessages: ConversationMessageRecord[],
  summaries: ThreadSummaryRecord[],
  currentMessage: string,
  budgetManager: TokenBudgetManager,
  allocation: TokenAllocation,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []

  // 1. Key facts preamble
  const factsText = formatKeyFactsPreamble(summaries)
  if (factsText && allocation.keyFacts > 0) {
    const trimmed = budgetManager.trimToFit(factsText, allocation.keyFacts, 'reduce_items')
    if (trimmed) {
      messages.push({
        role: 'user',
        content: `[Previous conversation context]\n${trimmed}`,
      })
      messages.push({
        role: 'assistant',
        content: 'Understood, I have this context from our earlier conversations.',
      })
    }
  }

  // 2. Compressed history summaries
  const compressedText = formatCompressedSummaries(summaries)
  if (compressedText && allocation.compressedHistory > 0) {
    const trimmed = budgetManager.trimToFit(
      compressedText,
      allocation.compressedHistory,
      'reduce_items',
    )
    if (trimmed) {
      messages.push({
        role: 'user',
        content: `[Earlier in this conversation]\n${trimmed}`,
      })
      messages.push({
        role: 'assistant',
        content: '[Summary acknowledged]',
      })
    }
  }

  // 3. Verbatim recent messages (oldest first for chronological order)
  const sorted = [...recentMessages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  for (const msg of sorted) {
    const param = convertToMessageParam(msg)
    if (param) messages.push(param)
  }

  // 4. Current user message (always included)
  // Check if the last message is already the current message to avoid duplication
  const lastMsg = messages[messages.length - 1]
  const alreadyIncluded =
    lastMsg &&
    lastMsg.role === 'user' &&
    typeof lastMsg.content === 'string' &&
    lastMsg.content === currentMessage

  if (!alreadyIncluded) {
    messages.push({ role: 'user', content: currentMessage })
  }

  // Ensure valid message sequence: must start with user, alternate roles
  return ensureValidMessageSequence(messages)
}

/**
 * Ensure the message array follows Anthropic API constraints:
 * - Must start with a 'user' message
 * - Must end with a 'user' message
 * - Must alternate between 'user' and 'assistant' roles
 *   (consecutive same-role messages get merged)
 */
function ensureValidMessageSequence(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return []

  const result: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    const prev = result[result.length - 1]

    if (!prev) {
      // First message must be 'user'
      if (msg.role === 'user') {
        result.push(msg)
      } else {
        // Prepend a synthetic user message
        result.push({ role: 'user', content: '[Conversation continues]' })
        result.push(msg)
      }
      continue
    }

    if (msg.role === prev.role) {
      // Merge consecutive same-role messages
      if (typeof prev.content === 'string' && typeof msg.content === 'string') {
        result[result.length - 1] = {
          role: prev.role,
          content: `${prev.content}\n\n${msg.content}`,
        }
      } else {
        // For content block arrays, insert a minimal separator message
        const separatorRole = msg.role === 'user' ? 'assistant' : 'user'
        result.push({ role: separatorRole, content: '[Continued]' })
        result.push(msg)
      }
    } else {
      result.push(msg)
    }
  }

  return result
}

// ─── ContextAssembler ───────────────────────────────────────────────────────

export class ContextAssembler {
  private config: AssemblerConfig
  private budgetManager: TokenBudgetManager
  private userProfile?: UserProfile

  constructor(config?: Partial<AssemblerConfig> & { userProfile?: UserProfile }) {
    const { userProfile, ...assemblerConfig } = config ?? {}
    this.config = { ...DEFAULT_ASSEMBLER_CONFIG, ...assemblerConfig }
    this.budgetManager = new TokenBudgetManager(this.config.tokenBudget)
    this.userProfile = userProfile
  }

  /**
   * Main entry point. Assembles all 4 tiers into a single context object.
   * Target: <200ms total latency.
   *
   * Uses Promise.allSettled for graceful per-tier degradation:
   * if any tier fails, the assembler continues with what it has.
   */
  async assemble(
    supabase: SupabaseClient,
    userId: string,
    orgId: string,
    threadId: string,
    currentMessage: string,
  ): Promise<AssembledContext> {
    const assemblyStart = performance.now()
    const tierStatuses: TierStatus[] = []

    // ── Phase 1: Parallel fetch (including RAG) ────────────────────────

    const [systemPromptResult, recentMsgsResult, approvalsResult, summariesResult, ragResult] =
      await Promise.all([
        timedFetch('system_prompt', () =>
          buildEntityAwarePrompt(supabase, orgId, currentMessage, this.userProfile),
        ),
        timedFetch('recent_messages', () =>
          loadRecentMessages(supabase, threadId, this.config.maxRecentTurns),
        ),
        this.config.includePendingActions
          ? timedFetch('pending_actions', () =>
              getPendingApprovals(supabase, orgId, { limit: 5 }),
            )
          : Promise.resolve<TierResult<ApprovalRecord[]>>({
              data: [],
              loaded: true,
              latencyMs: 0,
            }),
        this.config.includeCompressedHistory
          ? timedFetch('thread_summaries', () =>
              loadThreadSummaries(supabase, threadId),
            )
          : Promise.resolve<TierResult<ThreadSummaryRecord[]>>({
              data: [],
              loaded: true,
              latencyMs: 0,
            }),
        // RAG retrieval: runs in parallel with other context fetches
        process.env.PINECONE_API_KEY
          ? timedFetch('retrieved_context', async () => {
              const { searchVectors, formatChunksForContext } = await import('@/lib/rag/retriever')
              const chunks = await searchVectors({
                query: currentMessage,
                orgId,
                topK: 5,
              })
              return formatChunksForContext(chunks)
            })
          : Promise.resolve<TierResult<string>>({
              data: '',
              loaded: false,
              latencyMs: 0,
            }),
      ])

    // Extract results with fallbacks
    const systemPrompt = systemPromptResult.data ?? buildFallbackPrompt(orgId)
    const recentMessages = recentMsgsResult.data ?? []
    const approvals = approvalsResult.data ?? []
    const summaries = summariesResult.data ?? []
    const retrievedContextText = ragResult.data ?? ''

    // Track RAG retrieval status
    tierStatuses.push({
      tier: 'retrieved_context',
      loaded: ragResult.loaded,
      latencyMs: ragResult.latencyMs,
      tokenCount: this.budgetManager.estimateTokens(retrievedContextText),
      error: ragResult.error,
    })

    // ── Phase 2: Entity mention scan (for metadata, <1ms) ───────────────

    // Quick scan to populate metadata — entity context is already in systemPrompt
    // via buildEntityAwarePrompt. We just extract mention names for reporting.
    let entityMentions: string[] = []
    try {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, emails, phones, aliases')
        .eq('org_id', orgId)

      if (contacts) {
        const scanContacts = contacts.map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          emails: (c.emails as string[]) ?? [],
          phones: (c.phones as string[]) ?? [],
          aliases: (c.aliases as string[]) ?? [],
        }))
        const mentions = scanForEntityMentions(
          currentMessage,
          scanContacts,
          this.config.maxEntities,
        )
        entityMentions = mentions.map((m) => m.contactName)
      }
    } catch {
      // Non-critical: entity mentions are metadata only
    }

    // ── Phase 3: Build pending actions section ──────────────────────────

    const pendingActionsSection = formatPendingActionsSection(approvals)

    // ── Phase 4: Token budget allocation ────────────────────────────────

    const tiers: TierInput[] = [
      {
        name: 'systemPrompt',
        content: systemPrompt,
        priority: 1,
        minTokens: 4000,
        maxTokens: 12000,
        compressible: true,
      },
      {
        name: 'pendingActions',
        content: pendingActionsSection,
        priority: 2,
        minTokens: 0,
        maxTokens: 800,
        compressible: true,
      },
      {
        name: 'recentTurns',
        content: recentMessages.map((m) => m.content).join('\n'),
        priority: 3,
        minTokens: 1200,
        maxTokens: 12000,
        compressible: true,
      },
      {
        name: 'retrievedContext',
        content: retrievedContextText,
        priority: 4,
        minTokens: 0,
        maxTokens: 6000,
        compressible: true,
      },
      {
        name: 'entityContext',
        content: '', // Already embedded in systemPrompt by buildEntityAwarePrompt
        priority: 5,
        minTokens: 0,
        maxTokens: 0,
        compressible: false,
      },
      {
        name: 'compressedHistory',
        content: formatCompressedSummaries(summaries),
        priority: 6,
        minTokens: 0,
        maxTokens: 4000,
        compressible: true,
      },
      {
        name: 'keyFacts',
        content: formatKeyFactsPreamble(summaries),
        priority: 7,
        minTokens: 0,
        maxTokens: 2000,
        compressible: true,
      },
    ]

    const allocation = this.budgetManager.allocate(tiers)

    // ── Phase 5: Build final system prompt ──────────────────────────────

    let finalSystemPrompt = systemPrompt

    // Trim system prompt if over budget
    if (
      this.budgetManager.estimateTokens(finalSystemPrompt) > allocation.systemPrompt &&
      allocation.systemPrompt > 0
    ) {
      finalSystemPrompt = this.budgetManager.trimToFit(
        finalSystemPrompt,
        allocation.systemPrompt,
        'reduce_sections',
      )
    }

    // Append pending actions
    if (pendingActionsSection) {
      const trimmedActions = this.budgetManager.trimToFit(
        pendingActionsSection,
        allocation.pendingActions,
        'reduce_items',
      )
      if (trimmedActions) {
        finalSystemPrompt = `${finalSystemPrompt}\n\n${trimmedActions}`
      }
    }

    // Append retrieved context (RAG)
    if (retrievedContextText) {
      const trimmedRetrieved = this.budgetManager.trimToFit(
        retrievedContextText,
        allocation.retrievedContext,
        'reduce_items',
      )
      if (trimmedRetrieved) {
        finalSystemPrompt = `${finalSystemPrompt}\n\n## Retrieved Context\n${trimmedRetrieved}`
      }
    }

    // Append Memory Palace proactive recall (institutional knowledge)
    try {
      // Extract entity IDs from entity mentions for targeted recall
      let recallEntityIds: string[] = []
      if (entityMentions.length > 0) {
        const { data: mentionedContacts } = await supabase
          .from('contacts')
          .select('id')
          .eq('org_id', orgId)
          .in('name', entityMentions)
          .limit(3)
        recallEntityIds = (mentionedContacts ?? []).map((c: Record<string, unknown>) => c.id as string)
      }

      const recallResults = await recallForContext(supabase, orgId, recallEntityIds)

      if (recallResults.length > 0) {
        const { formatProactiveRecall } = await import('@/lib/memory-palace')
        const formattedContext = formatProactiveRecall(recallResults)
        if (formattedContext) {
          finalSystemPrompt = `${finalSystemPrompt}\n\n${formattedContext}`
        }
      }
    } catch {
      // Non-critical: proactive recall is additive, not essential
    }

    // ── Phase 6: Build message history ──────────────────────────────────

    // Trim recent messages to fit allocation
    let trimmedMessages = recentMessages
    if (allocation.recentTurns > 0) {
      const totalTokens = recentMessages.reduce(
        (sum, m) => sum + this.budgetManager.estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS,
        0,
      )
      if (totalTokens > allocation.recentTurns) {
        // Remove oldest messages until within budget
        trimmedMessages = [...recentMessages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        let runningTokens = 0
        const kept: ConversationMessageRecord[] = []
        for (const msg of trimmedMessages) {
          const msgTokens =
            this.budgetManager.estimateTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS
          if (runningTokens + msgTokens > allocation.recentTurns) break
          kept.push(msg)
          runningTokens += msgTokens
        }
        trimmedMessages = kept
      }
    }

    const messageHistory = buildMessageHistory(
      trimmedMessages,
      summaries,
      currentMessage,
      this.budgetManager,
      allocation,
    )

    // ── Phase 7: Collect tier statuses ──────────────────────────────────

    tierStatuses.push({
      tier: 'working',
      loaded: systemPromptResult.loaded,
      latencyMs: systemPromptResult.latencyMs,
      tokenCount: this.budgetManager.estimateTokens(finalSystemPrompt),
      error: systemPromptResult.error,
    })

    tierStatuses.push({
      tier: 'session_history',
      loaded: recentMsgsResult.loaded,
      latencyMs: recentMsgsResult.latencyMs,
      tokenCount: this.budgetManager.estimateMessageTokens(messageHistory),
      error: recentMsgsResult.error,
    })

    tierStatuses.push({
      tier: 'compiled_memory',
      loaded: summariesResult.loaded,
      latencyMs: summariesResult.latencyMs,
      tokenCount:
        this.budgetManager.estimateTokens(formatKeyFactsPreamble(summaries)) +
        this.budgetManager.estimateTokens(formatCompressedSummaries(summaries)),
      error: summariesResult.error,
    })

    tierStatuses.push({
      tier: 'action_state',
      loaded: approvalsResult.loaded,
      latencyMs: approvalsResult.latencyMs,
      tokenCount: this.budgetManager.estimateTokens(pendingActionsSection),
      error: approvalsResult.error,
    })

    const assemblyMs = Math.round(performance.now() - assemblyStart)

    if (assemblyMs > 200) {
      logger.warn('[context-assembler] Assembly exceeded 200ms target', {
        assemblyMs,
        tiers: tierStatuses.map((t) => `${t.tier}:${t.latencyMs}ms`),
      })
    }

    logger.info('[context-assembler] Assembly complete', {
      assemblyMs,
      totalTokens: allocation.total,
      budget: allocation.budget,
      overBudget: allocation.overBudget,
      recentMsgCount: trimmedMessages.length,
      pendingActions: approvals.length,
      entityMentions: entityMentions.length,
    })

    return {
      systemPrompt: finalSystemPrompt,
      messageHistory,
      metadata: {
        tokenUsage: allocation,
        tiersLoaded: tierStatuses,
        assemblyMs,
        entityMentions,
        pendingActionCount: approvals.length,
      },
    }
  }
}

// ─── Fallback prompt ────────────────────────────────────────────────────────

function buildFallbackPrompt(orgId: string): string {
  return `You are BitBit, an intelligent personal assistant. You help manage tasks, communications, and schedule across multiple channels.

## Identity
You are concise, proactive, and action-oriented.

## Current Context
Organization: ${orgId}
Date/Time: ${new Date().toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })}

## Guidelines
- Be concise and action-oriented
- When creating tasks, assign appropriate priority and column
- Log significant actions to the activity feed`
}

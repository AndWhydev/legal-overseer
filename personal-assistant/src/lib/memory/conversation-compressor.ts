/**
 * Conversation Compressor — Tiered summarization pipeline.
 *
 * Implements incremental compression of conversation history:
 * - Verbatim tier: last N turns kept as-is
 * - Compressed tier: middle turns summarized via Haiku
 * - Key-facts tier: oldest turns reduced to structured facts
 *
 * All Haiku calls are fire-and-forget (async post-response).
 * Context loading (loadThreadContext) is sync and on the critical path.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type {
  ConversationMessageRecord,
  ThreadSummaryRecord,
  KeyFact,
  ThreadContext,
  CompressionConfig,
  SummaryTier,
} from '@/lib/conversation/types'
import { DEFAULT_COMPRESSION_CONFIG } from '@/lib/conversation/types'
import { loadRecentMessages, loadThreadSummaries } from '@/lib/conversation/thread-resolver'

// ─── Prompt Templates ──────────────────────────────────────────────────────

const FULL_SUMMARY_PROMPT = `You are a conversation summarizer. Condense the following conversation turns into a brief summary (2-3 sentences).

PRESERVE:
- Decisions made and their rationale
- Action items and who is responsible
- Entity names (people, companies, projects)
- Commitments made by either party
- Financial amounts, invoice numbers
- Dates and deadlines mentioned
- Key facts about entities

DISCARD:
- Greetings and small talk
- Repeated information
- Formatting details
- Questions that were answered (keep only the answer)
- Meta-commentary about the conversation itself

CONVERSATION TURNS:
{TURNS_JSON}

Write a concise 2-3 sentence summary. Begin immediately, no preamble.`

const INCREMENTAL_SUMMARY_PROMPT = `You are a conversation summarizer. You have an existing summary and new conversation turns. Produce an updated summary that incorporates the new information.

EXISTING SUMMARY:
{EXISTING_SUMMARY}

NEW CONVERSATION TURNS:
{NEW_TURNS}

RULES:
- Keep the summary to 2-4 sentences
- Preserve all important facts from the existing summary
- Integrate new information naturally
- If new info contradicts old info, prefer the newer info
- Keep entity names, amounts, dates, and commitments

Write the updated summary. Begin immediately, no preamble.`

const KEY_FACTS_PROMPT = `Extract structured key facts from this conversation excerpt. Return ONLY valid JSON.

Focus on facts that a future conversation would need:
- Financial: amounts, invoices, payment status
- Commitments: promises, agreements, deadlines
- Decisions: choices made, reasons given
- Entity states: status changes, relationship updates
- Action items: tasks assigned, follow-ups needed

CONVERSATION EXCERPT:
{TURNS_JSON}

Return JSON array:
[
  {
    "type": "financial|commitment|decision|entity_state|action_item|deadline",
    "text": "concise fact statement",
    "entity_names": ["Person or Company mentioned"],
    "confidence": 0.0-1.0
  }
]

Return [] if no significant facts found.`

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fast token estimation: ~4 chars per token for English text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function serializeTurns(turns: ConversationMessageRecord[]): string {
  return turns
    .map(t => `Turn ${t.turn_number} (${t.role}): ${t.content}`)
    .join('\n')
}

// ─── ConversationCompressor ─────────────────────────────────────────────────

export class ConversationCompressor {
  private supabase: SupabaseClient
  private config: CompressionConfig

  constructor(
    supabase: SupabaseClient,
    config?: Partial<CompressionConfig>,
  ) {
    this.supabase = supabase
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config }
  }

  /**
   * Load tiered context for a thread, respecting token budgets.
   * SYNC — called during context assembly before Anthropic API call.
   */
  async loadThreadContext(
    threadId: string,
    config?: Partial<CompressionConfig>,
  ): Promise<ThreadContext> {
    const cfg = config ? { ...this.config, ...config } : this.config

    // Load thread metadata
    const { data: thread } = await this.supabase
      .from('conversation_threads')
      .select('turn_count, status, compiled_summary')
      .eq('id', threadId)
      .maybeSingle()

    if (!thread || thread.status === 'archived') {
      return {
        threadId,
        turnCount: 0,
        recentTurns: [],
        compressedSummary: null,
        keyFacts: [],
        compiledSummary: thread?.compiled_summary ?? null,
        totalTokens: 0,
      }
    }

    const turnCount: number = thread.turn_count ?? 0

    // Load verbatim recent turns
    const recentTurns = await loadRecentMessages(
      this.supabase,
      threadId,
      cfg.verbatimTurns,
    )

    let totalTokens = recentTurns.reduce(
      (sum, t) => sum + (t.token_count ?? estimateTokens(t.content)),
      0,
    )

    // Load all summaries for this thread
    const allSummaries = await loadThreadSummaries(this.supabase, threadId)

    // Load compressed summary if past threshold
    let compressedSummary: string | null = null
    if (turnCount > cfg.compressionThreshold) {
      const compressed = allSummaries
        .filter(s => s.tier === 'compressed')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (compressed.length > 0) {
        compressedSummary = compressed[0].summary_text
        totalTokens += compressed[0].token_count
      }
    }

    // Load key facts if past threshold
    let keyFacts: KeyFact[] = []
    if (turnCount > cfg.keyFactsThreshold) {
      const factSummaries = allSummaries
        .filter(s => s.tier === 'key_facts')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (factSummaries.length > 0) {
        keyFacts = factSummaries[0].key_facts ?? []
        totalTokens += factSummaries[0].token_count
      }
    }

    return {
      threadId,
      turnCount,
      recentTurns,
      compressedSummary,
      keyFacts,
      compiledSummary: null,
      totalTokens,
    }
  }

  /**
   * Check if compression is needed and trigger it.
   * ASYNC — fire-and-forget after response sent.
   */
  async checkAndCompress(
    threadId: string,
    currentTurnCount: number,
    config?: Partial<CompressionConfig>,
  ): Promise<void> {
    const cfg = config ? { ...this.config, ...config } : this.config

    if (currentTurnCount <= cfg.compressionThreshold) return

    try {
      await this.compressTurns(threadId, currentTurnCount, cfg)
      await this.extractKeyFactsIfNeeded(threadId, currentTurnCount, cfg)
    } catch (err) {
      logger.error('[conversation-compressor] checkAndCompress failed', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Generate or extend compressed summary for the middle turns.
   */
  private async compressTurns(
    threadId: string,
    currentTurnCount: number,
    cfg: CompressionConfig,
  ): Promise<void> {
    // Check existing summary
    const existing = await this.getLatestSummary(threadId, 'compressed')

    const verbatimStart = currentTurnCount - cfg.verbatimTurns + 1

    // Determine if we need recompression
    if (existing && existing.turn_range_end >= verbatimStart - 1) {
      return // summary already covers up to verbatim window
    }

    // Determine turn range to summarize
    let summarizeStart = 1
    if (currentTurnCount > cfg.keyFactsThreshold) {
      // Key facts cover the oldest turns; summarize from after that
      summarizeStart = cfg.keyFactsThreshold + 1
    }
    const summarizeEnd = verbatimStart - 1

    if (summarizeEnd < summarizeStart) return

    // Load turns to summarize
    const { data: turns } = await this.supabase
      .from('conversation_messages')
      .select('*')
      .eq('thread_id', threadId)
      .gte('turn_number', summarizeStart)
      .lte('turn_number', summarizeEnd)
      .order('turn_number', { ascending: true })

    if (!turns || turns.length === 0) return

    const summary = await this.summarizeTurns(
      threadId,
      turns,
      'compressed',
      existing,
    )

    // Upsert summary record
    await this.supabase.from('thread_summaries').upsert(
      {
        thread_id: threadId,
        org_id: turns[0].org_id,
        tier: 'compressed',
        turn_range_start: summary.turn_range_start,
        turn_range_end: summary.turn_range_end,
        summary_text: summary.summary_text,
        token_count: summary.token_count,
        entity_ids: summary.entity_ids,
        key_facts: [],
        supersedes: existing?.id ?? null,
        model_used: cfg.summarizationModel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'thread_id,tier,turn_range_start' },
    )

    logger.info('[conversation-compressor] Compressed turns', {
      threadId,
      rangeStart: summary.turn_range_start,
      rangeEnd: summary.turn_range_end,
      tokens: summary.token_count,
    })
  }

  /**
   * Extract key facts from oldest turns if past threshold.
   */
  private async extractKeyFactsIfNeeded(
    threadId: string,
    currentTurnCount: number,
    cfg: CompressionConfig,
  ): Promise<void> {
    if (currentTurnCount <= cfg.keyFactsThreshold) return

    const existing = await this.getLatestSummary(threadId, 'key_facts')
    const keyFactsEnd = cfg.keyFactsThreshold

    if (existing && existing.turn_range_end >= keyFactsEnd) return

    // Load oldest turns
    const { data: turns } = await this.supabase
      .from('conversation_messages')
      .select('*')
      .eq('thread_id', threadId)
      .gte('turn_number', 1)
      .lte('turn_number', keyFactsEnd)
      .order('turn_number', { ascending: true })

    if (!turns || turns.length === 0) return

    const facts = await this.extractKeyFacts(threadId, turns)
    const bulletText = facts.map(f => `- [${f.type}] ${f.text}`).join('\n')

    await this.supabase.from('thread_summaries').upsert(
      {
        thread_id: threadId,
        org_id: turns[0].org_id,
        tier: 'key_facts',
        turn_range_start: 1,
        turn_range_end: keyFactsEnd,
        summary_text: bulletText,
        token_count: estimateTokens(bulletText),
        entity_ids: [...new Set(facts.flatMap(f => f.entityIds))],
        key_facts: facts,
        supersedes: existing?.id ?? null,
        model_used: cfg.summarizationModel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'thread_id,tier,turn_range_start' },
    )

    logger.info('[conversation-compressor] Extracted key facts', {
      threadId,
      factCount: facts.length,
    })
  }

  /**
   * Generate a summary (full or incremental) of specific turns.
   * Uses incremental summarization when extending an existing summary.
   */
  async summarizeTurns(
    threadId: string,
    turns: ConversationMessageRecord[],
    tier: SummaryTier,
    existing?: ThreadSummaryRecord | null,
  ): Promise<Pick<ThreadSummaryRecord, 'turn_range_start' | 'turn_range_end' | 'summary_text' | 'token_count' | 'entity_ids'>> {
    const turnsText = serializeTurns(turns)

    let prompt: string
    if (existing && existing.turn_range_end === turns[0].turn_number - 1) {
      // Incremental: extend existing summary with new turns
      prompt = INCREMENTAL_SUMMARY_PROMPT
        .replace('{EXISTING_SUMMARY}', existing.summary_text)
        .replace('{NEW_TURNS}', turnsText)
    } else {
      // Full re-summarization
      prompt = FULL_SUMMARY_PROMPT.replace('{TURNS_JSON}', turnsText)
    }

    const { text: summaryText, usage } = await generateText({
      model: models.fast,
      maxOutputTokens: 300,
      prompt,
    })

    const tokenCount = usage?.outputTokens ?? estimateTokens(summaryText)

    return {
      turn_range_start: existing?.turn_range_start ?? turns[0].turn_number,
      turn_range_end: turns[turns.length - 1].turn_number,
      summary_text: summaryText,
      token_count: tokenCount,
      entity_ids: [],
    }
  }

  /**
   * Extract structured key facts from turns via Haiku.
   */
  async extractKeyFacts(
    _threadId: string,
    turns: ConversationMessageRecord[],
  ): Promise<KeyFact[]> {
    const turnsText = serializeTurns(turns)
    const prompt = KEY_FACTS_PROMPT.replace('{TURNS_JSON}', turnsText)

    try {
      const { text: responseText } = await generateText({
        model: models.fast,
        maxOutputTokens: 500,
        prompt,
      })

      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        type: string
        text: string
        entity_names?: string[]
        confidence?: number
      }>

      const turnNumbers = turns.map(t => t.turn_number)

      return parsed.map(f => ({
        type: (f.type || 'entity_state') as KeyFact['type'],
        text: f.text,
        entityIds: [], // Resolved by consolidator later
        confidence: f.confidence ?? 0.5,
        extractedFromTurns: turnNumbers,
      }))
    } catch (err) {
      logger.error('[conversation-compressor] extractKeyFacts failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  /**
   * Get the most recent summary record for a given tier.
   */
  private async getLatestSummary(
    threadId: string,
    tier: SummaryTier,
  ): Promise<ThreadSummaryRecord | null> {
    const { data } = await this.supabase
      .from('thread_summaries')
      .select('*')
      .eq('thread_id', threadId)
      .eq('tier', tier)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data as ThreadSummaryRecord | null
  }
}
/**
 * Thread Archiver — Archives stale conversation threads.
 *
 * Generates final archival summaries via Haiku, updates thread status,
 * and triggers entity profile recomputation for mentioned entities.
 *
 * Called from a cron route (every 15 minutes) or on-demand.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger'
import type { ConversationMessageRecord, ThreadSummaryRecord } from '@/lib/conversation/types'
import { scanForEntityMentions, type ScanContact } from '@/lib/context/entity-mention-scanner'
import { computeEntityProfile } from '@/lib/context/entity-profile-builder'

// ─── Prompt Template ────────────────────────────────────────────────────────

const ARCHIVAL_SUMMARY_PROMPT = `Summarize this complete conversation thread for long-term memory storage. The summary will be used to provide context if the topic comes up again in future conversations.

CONVERSATION:
{FULL_THREAD_JSON}

Write a comprehensive summary (3-5 sentences) covering:
1. What was discussed (topic/purpose)
2. Key outcomes (decisions, actions taken)
3. Outstanding items (unresolved questions, pending actions)
4. Important facts learned about entities mentioned

Begin immediately, no preamble.`

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ArchivalResult {
  threadId: string
  turnCount: number
  summaryTokens: number
  entityIds: string[]
}

// ─── ThreadArchiver ─────────────────────────────────────────────────────────

export class ThreadArchiver {
  private supabase: SupabaseClient
  private anthropic: Anthropic

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
    this.anthropic = new Anthropic()
  }

  /**
   * Archive a single thread: generate compiled summary, update status.
   * Returns the archival result with summary metadata.
   */
  async archiveThread(
    threadId: string,
    orgId: string,
  ): Promise<ArchivalResult | null> {
    try {
      // Load all conversation turns
      const { data: turns } = await this.supabase
        .from('conversation_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('turn_number', { ascending: true })

      if (!turns || turns.length === 0) {
        logger.warn('[thread-archiver] No turns found for thread', { threadId })
        return null
      }

      // Generate archival summary via Haiku
      const serialized = (turns as ConversationMessageRecord[])
        .map(t => `Turn ${t.turn_number} (${t.role}): ${t.content}`)
        .join('\n')

      const response = await this.anthropic.messages.create({
        model: resolveModel('classification'),
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: ARCHIVAL_SUMMARY_PROMPT.replace('{FULL_THREAD_JSON}', serialized),
        }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      const summaryText = textBlock && textBlock.type === 'text'
        ? textBlock.text
        : ''
      const tokenCount = response.usage?.output_tokens ?? Math.ceil(summaryText.length / 4)

      // Extract entity IDs from all turns via mention scanning
      const entityIds = await this.extractThreadEntityIds(orgId, turns as ConversationMessageRecord[])

      // Store archival summary in thread_summaries
      const { data: summaryRecord } = await this.supabase
        .from('thread_summaries')
        .insert({
          thread_id: threadId,
          org_id: orgId,
          tier: 'archived',
          turn_range_start: 1,
          turn_range_end: turns.length,
          summary_text: summaryText,
          token_count: tokenCount,
          entity_ids: entityIds,
          key_facts: [],
          model_used: resolveModel('classification'),
        })
        .select('id')
        .single()

      // Update thread status to archived with compiled summary
      await this.supabase
        .from('conversation_threads')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          compiled_summary: summaryText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', threadId)

      // Trigger entity profile recomputation for all mentioned entities
      for (const entityId of entityIds) {
        computeEntityProfile(this.supabase, {
          orgId,
          entityType: 'contact',
          entityId,
        }).catch(() => {}) // fire-and-forget
      }

      const result: ArchivalResult = {
        threadId,
        turnCount: turns.length,
        summaryTokens: tokenCount,
        entityIds,
      }

      logger.info('[thread-archiver] Archived thread', result)
      return result
    } catch (err) {
      logger.error('[thread-archiver] archiveThread failed', {
        threadId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * Find and archive all stale threads.
   * Calls the archive_stale_threads RPC to atomically mark threads,
   * then processes each one.
   */
  async archiveStaleThreads(
    batchSize: number = 10,
  ): Promise<ArchivalResult[]> {
    const results: ArchivalResult[] = []

    try {
      // Call RPC to get stale threads (atomically marks them for processing)
      const { data: staleThreads, error } = await this.supabase
        .rpc('archive_stale_threads')

      if (error) {
        logger.error('[thread-archiver] archive_stale_threads RPC failed', {
          error: error.message,
        })

        // Fallback: query directly
        const { data: fallbackThreads } = await this.supabase
          .from('conversation_threads')
          .select('id, org_id, turn_count')
          .eq('status', 'active')
          .lt('last_activity_at', new Date(Date.now() - 86_400_000).toISOString())
          .limit(batchSize)

        if (!fallbackThreads || fallbackThreads.length === 0) return results

        for (const thread of fallbackThreads) {
          const result = await this.archiveThread(thread.id, thread.org_id)
          if (result) results.push(result)
        }

        return results
      }

      if (!staleThreads || staleThreads.length === 0) {
        logger.debug('[thread-archiver] No stale threads to archive')
        return results
      }

      // Process each stale thread (limited by batch size)
      const toProcess = (staleThreads as Array<{ id: string; org_id: string }>).slice(0, batchSize)

      for (const thread of toProcess) {
        const result = await this.archiveThread(thread.id, thread.org_id)
        if (result) results.push(result)
      }

      logger.info('[thread-archiver] Batch archival complete', {
        processed: toProcess.length,
        archived: results.length,
      })
    } catch (err) {
      logger.error('[thread-archiver] archiveStaleThreads failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return results
  }

  /**
   * Extract unique entity IDs from all turns in a thread.
   * Uses the fast string-match scanner against known contacts.
   */
  private async extractThreadEntityIds(
    orgId: string,
    turns: ConversationMessageRecord[],
  ): Promise<string[]> {
    const { data } = await this.supabase
      .from('contacts')
      .select('id, name, emails, phones, aliases')
      .eq('org_id', orgId)

    if (!data) return []

    const scanContacts: ScanContact[] = data.map(c => ({
      id: c.id,
      name: c.name,
      emails: c.emails ?? [],
      phones: c.phones ?? [],
      aliases: c.aliases ?? [],
    }))

    const entityIds = new Set<string>()
    const allText = turns.map(t => t.content).join(' ')
    const mentions = scanForEntityMentions(allText, scanContacts, 50)

    for (const mention of mentions) {
      entityIds.add(mention.contactId)
    }

    return [...entityIds]
  }
}

/**
 * Tier 1 Intake Clerk — Living Brain WAL consumer.
 *
 * Reads unconsolidated WAL entries, extracts structured facts via Gemini Flash,
 * groups by domain + entity, and routes to Section Librarian queues.
 *
 * Target: <2s per batch. Runs continuously via BullMQ worker.
 */

import { gateway, generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Queue } from 'bullmq'

import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { SignalType, DomainType, KnowledgeLogEntry } from './types'
import type { LibrarianJob } from './worker-infra'
import { readWALTail } from './wal-emitter'

// ─── Signal -> Domain Mapping ──────────────────────────────────────────────

const SIGNAL_DOMAIN_MAP: Record<SignalType, DomainType> = {
  message: 'operational',
  invoice: 'financial',
  calendar: 'operational',
  pattern: 'behavioral',
  correction: 'operational',
  decision: 'operational',
  relationship: 'relational',
  pricing: 'financial',
  fiduciary: 'financial',
  delegated_action: 'operational',
}

/**
 * Map a signal type to its target domain queue.
 */
export function signalToDomain(signal: SignalType): DomainType {
  return SIGNAL_DOMAIN_MAP[signal]
}

// ─── Fact Extraction ───────────────────────────────────────────────────────

export interface ExtractedFact {
  entity_name: string
  fact: string
  domain: DomainType
}

const EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction engine for a personal assistant's memory system.
Given a batch of signals (messages, invoices, calendar events, etc.), extract structured facts as JSON lines.

Each line MUST be valid JSON with exactly these fields:
{"entity_name": "...", "fact": "...", "domain": "financial|relational|operational|behavioral"}

Rules:
- entity_name: the person, company, or entity the fact is about
- fact: a concise, specific factual statement
- domain: categorize as financial (money, invoices, pricing), relational (people, relationships), operational (tasks, meetings, logistics), or behavioral (patterns, habits, preferences)
- Output ONLY JSON lines, one per fact. No other text, no markdown, no numbering.
- Extract ALL facts from the batch. One signal may yield multiple facts.`

/**
 * Extract structured facts from a batch of WAL entries using Gemini Flash.
 * Returns parsed facts; malformed lines are silently skipped.
 */
export async function extractFactsFromBatch(
  entries: KnowledgeLogEntry[],
): Promise<ExtractedFact[]> {
  if (entries.length === 0) return []

  const batchContent = entries
    .map((e, i) => `${i + 1}. [${e.signal_type}] ${e.content}`)
    .join('\n')

  try {
    const { text } = await generateText({
      model: gateway(models.fast),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: batchContent,
    })

    const facts: ExtractedFact[] = []
    const lines = text.trim().split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed)
        if (
          typeof parsed.entity_name === 'string' &&
          typeof parsed.fact === 'string' &&
          typeof parsed.domain === 'string' &&
          ['financial', 'relational', 'operational', 'behavioral'].includes(parsed.domain)
        ) {
          facts.push({
            entity_name: parsed.entity_name,
            fact: parsed.fact,
            domain: parsed.domain as DomainType,
          })
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    return facts
  } catch (err) {
    logger.warn('[intake-clerk] Failed to extract facts from batch', {
      error: err instanceof Error ? err.message : String(err),
      entryCount: entries.length,
    })
    return []
  }
}

// ─── Entity → WAL Entry Grouping ──────────────────────────────────────────

export interface EntityEntryGroup {
  domain: DomainType
  entity_name: string
  entry_ids: string[]
}

/**
 * Map extracted facts back to their source WAL entry IDs by entity name.
 *
 * For each unique (domain, entity_name) pair from the extracted facts,
 * find which WAL entries mention that entity (case-insensitive content match).
 * Falls back to all entry IDs if no match is found (conservative).
 */
export function groupEntriesByEntity(
  entries: KnowledgeLogEntry[],
  facts: ExtractedFact[],
): Map<string, EntityEntryGroup> {
  const grouped = new Map<string, EntityEntryGroup>()

  for (const fact of facts) {
    const key = `${fact.domain}:${fact.entity_name}`
    if (!grouped.has(key)) {
      const nameLower = fact.entity_name.toLowerCase()
      const matchingIds = entries
        .filter((e) => e.content.toLowerCase().includes(nameLower))
        .map((e) => e.id)

      grouped.set(key, {
        domain: fact.domain,
        entity_name: fact.entity_name,
        entry_ids: matchingIds.length > 0 ? matchingIds : entries.map((e) => e.id),
      })
    } else {
      const group = grouped.get(key)!
      const nameLower = fact.entity_name.toLowerCase()
      for (const entry of entries) {
        if (
          entry.content.toLowerCase().includes(nameLower) &&
          !group.entry_ids.includes(entry.id)
        ) {
          group.entry_ids.push(entry.id)
        }
      }
    }
  }

  return grouped
}

// ─── WAL Batch Processing ──────────────────────────────────────────────────

interface DomainQueues {
  financial: Queue
  relational: Queue
  operational: Queue
  behavioral: Queue
}

interface ProcessResult {
  processed: number
  routed: number
}

interface ProcessOpts {
  batchSize?: number
}

/**
 * Process a batch of unconsolidated WAL entries:
 * 1. Read from WAL tail
 * 2. Extract facts via LLM
 * 3. Group by domain + entity
 * 4. Route to domain queues as LibrarianJobs
 * 5. Mark WAL entries as consolidated
 */
export async function processWALBatch(
  supabase: SupabaseClient,
  orgId: string,
  domainQueues: DomainQueues,
  opts?: ProcessOpts,
): Promise<ProcessResult> {
  const entries = await readWALTail(supabase, {
    org_id: orgId,
    limit: opts?.batchSize ?? 50,
  })

  if (entries.length === 0) {
    return { processed: 0, routed: 0 }
  }

  const entryIds = entries.map((e) => e.id)

  // Extract structured facts
  const facts = await extractFactsFromBatch(entries)

  // Group facts by domain -> entity
  const grouped = new Map<string, { domain: DomainType; entity_id: string; fact_ids: string[] }>()

  for (const fact of facts) {
    const key = `${fact.domain}:${fact.entity_name}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        domain: fact.domain,
        entity_id: fact.entity_name,
        fact_ids: [],
      })
    }
    grouped.get(key)!.fact_ids.push(fact.fact)
  }

  // Route to domain queues
  let routed = 0
  for (const [, group] of grouped) {
    const queue = domainQueues[group.domain]
    if (!queue) continue

    const job: LibrarianJob = {
      org_id: orgId,
      entity_id: group.entity_id,
      fact_ids: group.fact_ids,
      domain: group.domain,
    }

    await queue.add(`librarian:${group.entity_id}`, job)
    routed++
  }

  // Mark WAL entries as consolidated
  const now = new Date().toISOString()
  await supabase
    .from('knowledge_log')
    .update({ consolidated_at: now })
    .in('id', entryIds)

  logger.info('[intake-clerk] Batch processed', {
    org_id: orgId,
    processed: entries.length,
    facts_extracted: facts.length,
    jobs_routed: routed,
  })

  return { processed: entries.length, routed }
}

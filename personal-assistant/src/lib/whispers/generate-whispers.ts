import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from './types'
import { whisperStaleContacts } from './sources/stale-contacts'
import { whisperDueItems } from './sources/due-items'
import { whisperUnfinishedMomentum } from './sources/unfinished-momentum'
import { whisperAnomalies } from './sources/anomalies'
import { whisperProactiveCompletions } from './sources/proactive-completions'

const MAX_WHISPERS = 3
const MIN_SCORE = 0.3
const STALENESS_DECAY = 0.4

export async function generateWhispers(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<Whisper[]> {
  // Fire all sources in parallel
  const results = await Promise.allSettled([
    whisperStaleContacts(supabase, orgId),
    whisperDueItems(supabase, orgId),
    whisperUnfinishedMomentum(supabase, userId, orgId),
    whisperAnomalies(supabase, orgId),
    whisperProactiveCompletions(supabase, orgId),
  ])

  // Flatten all candidates
  const candidates: Whisper[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value)
    }
  }

  if (candidates.length === 0) return []

  // Apply staleness decay — check recent impressions
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recentImpressions } = await supabase
    .from('whisper_impressions')
    .select('source, entity_key')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .gte('shown_at', oneDayAgo)

  const recentKeys = new Set(
    (recentImpressions ?? []).map((imp) => `${imp.source}:${imp.entity_key}`),
  )

  for (const candidate of candidates) {
    const entityKey = deriveEntityKey(candidate)
    const key = `${candidate.source}:${entityKey}`
    if (recentKeys.has(key)) {
      candidate.score *= STALENESS_DECAY
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Select top whispers with diversity enforcement
  const selected: Whisper[] = []
  const usedSources = new Set<string>()

  for (const candidate of candidates) {
    if (selected.length >= MAX_WHISPERS) break
    if (candidate.score < MIN_SCORE) break
    if (usedSources.has(candidate.source)) continue

    selected.push(candidate)
    usedSources.add(candidate.source)
  }

  // Record impressions for staleness tracking
  if (selected.length > 0) {
    const impressions = selected.map((w) => ({
      user_id: userId,
      org_id: orgId,
      source: w.source,
      entity_key: deriveEntityKey(w),
    }))

    await supabase.from('whisper_impressions').insert(impressions).then(() => {})
  }

  return selected
}

function deriveEntityKey(whisper: Whisper): string {
  const ctx = whisper.context
  return String(
    ctx.contactId ?? ctx.invoiceId ?? ctx.taskId ?? ctx.threadId ?? ctx.alertId ?? ctx.approvalId ?? whisper.text.slice(0, 50),
  )
}

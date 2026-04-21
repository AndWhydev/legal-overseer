/**
 * Assess — pre-response freshness + corroboration gate for the TAOR loop.
 *
 * Why this exists: the loop was observed producing high-confidence verdicts
 * grounded in stale memory (56-day-old "waiting on credentials" claim quoted
 * as current truth). Memory retrieval already applies exponential decay to
 * scoring, but decay is a rank weight — it does not veto stale items from
 * surfacing.
 *
 * The Assess stage runs after context assembly and before the model call.
 * It inspects the surfaced memory set, scores coverage and freshness, and
 * returns one of three verdicts:
 *
 *   - `ok`              → proceed normally.
 *   - `hedge`           → instruct the model to hedge confident language.
 *   - `refresh_required`→ instruct the model to verify via a fresh lookup
 *                         (e.g. `search_gmail`, `search_messages`) before
 *                         committing to a recommendation.
 *
 * Side-effect free. Returns a structured verdict that the caller injects
 * into the system prompt as an operator note; the model is responsible for
 * reflecting the verdict in its response.
 */

import type { ScoredItem } from '@/lib/memory-palace/proactive-recall'

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** A memory older than this is eligible to be flagged stale. */
export const STALE_AGE_DAYS = 14

/**
 * Low-confidence floor. A memory older than STALE_AGE_DAYS AND with
 * confidence below this is marked stale for Assess purposes.
 * Deliberately permissive — we only flag items that are *both* old and weak.
 */
export const STALE_CONFIDENCE_FLOOR = 0.6

/**
 * Coverage gate. If corroboration score (fraction of memories that agree on
 * entity-level facts) falls below this, we hedge.
 */
export const HEDGE_COVERAGE_THRESHOLD = 0.5

/**
 * Refresh gate. If more than this fraction of memories touching the top-K
 * named entities are stale, we escalate to `refresh_required`.
 */
export const REFRESH_STALE_FRACTION = 0.3

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/**
 * Minimal shape the Assess stage needs from each surfaced memory.
 * Derived directly from ScoredItem (proactive-recall) but narrowed here so
 * Assess can also be driven from other retrieval paths later.
 */
export interface SurfacedMemoryLike {
  /** Stable identifier — may be the scored item's description hash, an entity id, or similar. */
  readonly id?: string
  readonly description: string
  readonly confidence: number
  /** Days since the underlying artefact's last update or last_fired_at. Null when unknown. */
  readonly ageDays: number | null
  /** Type (edge/event/vector) — used to weight corroboration. */
  readonly type?: ScoredItem['type']
  /** The blended score — exposed for tie-breaking and logging. */
  readonly blendedScore?: number
}

export interface AssessInput {
  /** Flattened list of scored items surfaced by context assembly. */
  readonly surfacedMemories: readonly SurfacedMemoryLike[]
  /** The raw user message — we don't parse it here, just surface it in the verdict payload. */
  readonly userMessage: string
  /** Named entity ids resolved from the message (may be empty). */
  readonly entityIds: readonly string[]
  /** Top-K cutoff for the "top entities" staleness ratio. */
  readonly topK?: number
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type AssessVerdict = 'ok' | 'hedge' | 'refresh_required'

export interface AssessResult {
  readonly verdict: AssessVerdict
  /** ids (or descriptions when ids are unavailable) of memories flagged stale. */
  readonly staleMemoryIds: readonly string[]
  /** 0–1. Higher = memories agree on entity-level facts. 1 when there's nothing to corroborate. */
  readonly corroborationScore: number
  /** Fraction of memories touching top-K entities that are stale. Null when no memories touched those entities. */
  readonly staleFraction: number | null
  /** Pre-baked operator note the caller can inject into the system prompt. Empty when verdict is `ok`. */
  readonly recommendedHedge: string
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Evaluate surfaced memories against the staleness + corroboration gates.
 *
 * Pure function. No I/O. Safe to call on every turn.
 */
export function assess(input: AssessInput): AssessResult {
  const { surfacedMemories, topK = 3 } = input
  const memories = surfacedMemories ?? []

  // ── Empty surface: nothing to assess, proceed normally. ─────────────
  if (memories.length === 0) {
    return {
      verdict: 'ok',
      staleMemoryIds: [],
      corroborationScore: 1,
      staleFraction: null,
      recommendedHedge: '',
    }
  }

  // ── Staleness classification ────────────────────────────────────────
  const staleIds: string[] = []
  for (const m of memories) {
    if (m.ageDays == null) continue // Unknown age → don't flag.
    if (m.ageDays > STALE_AGE_DAYS && m.confidence < STALE_CONFIDENCE_FLOOR) {
      staleIds.push(m.id ?? m.description)
    }
  }

  // ── Stale fraction across the surfaced set ──────────────────────────
  // We scope to "top-K" by score when blendedScore is available, otherwise
  // we evaluate across the full surface. This mirrors the plan language
  // ("top-K named entities") without requiring entity-level resolution here.
  const topMemories = topBySalience(memories, topK)
  const staleInTop = topMemories.filter(m =>
    m.ageDays != null &&
    m.ageDays > STALE_AGE_DAYS &&
    m.confidence < STALE_CONFIDENCE_FLOOR,
  ).length
  const staleFraction = topMemories.length > 0 ? staleInTop / topMemories.length : null

  // ── Corroboration score ─────────────────────────────────────────────
  //
  // Lightweight heuristic: memories agree when multiple high-confidence
  // items point at the same neighbour/verb (a stand-in for "entity-level
  // fact"). Parse neighbour/verb out of the description and count clusters.
  //
  // Rationale: a proper cross-document NLI check would need a model call;
  // Assess must stay sub-ms. The heuristic is biased toward "high coverage
  // when multiple independent items agree textually" — false positives
  // are safer here than false negatives (we'd over-hedge, not over-claim).
  const corroborationScore = computeCorroborationScore(memories)

  // ── Verdict ─────────────────────────────────────────────────────────
  let verdict: AssessVerdict = 'ok'
  if (staleFraction != null && staleFraction > REFRESH_STALE_FRACTION) {
    verdict = 'refresh_required'
  } else if (corroborationScore < HEDGE_COVERAGE_THRESHOLD) {
    verdict = 'hedge'
  }

  return {
    verdict,
    staleMemoryIds: staleIds,
    corroborationScore,
    staleFraction,
    recommendedHedge: buildHedgeNote(verdict, {
      staleCount: staleIds.length,
      totalCount: memories.length,
      corroborationScore,
    }),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function topBySalience(memories: readonly SurfacedMemoryLike[], k: number): readonly SurfacedMemoryLike[] {
  if (memories.length <= k) return memories
  // Sort descending by blendedScore when available, preserving input order otherwise.
  const sorted = [...memories].sort((a, b) => (b.blendedScore ?? 0) - (a.blendedScore ?? 0))
  return sorted.slice(0, k)
}

/**
 * Count co-occurring key tokens across descriptions. A token that appears in
 * N memories contributes (N-1) agreement pairs. Final score is
 * agreement / possible-pairs, clamped to [0, 1]. A single-memory surface
 * is treated as fully corroborated (score = 1) — there's nothing to conflict.
 */
function computeCorroborationScore(memories: readonly SurfacedMemoryLike[]): number {
  if (memories.length <= 1) return 1

  const tokenCounts = new Map<string, number>()
  for (const m of memories) {
    const tokens = extractSalientTokens(m.description)
    for (const tok of tokens) {
      tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1)
    }
  }

  let agreementPairs = 0
  for (const count of tokenCounts.values()) {
    if (count >= 2) {
      // Each token appearing in N memories yields C(N, 2) = N*(N-1)/2 pairs.
      agreementPairs += (count * (count - 1)) / 2
    }
  }

  const possiblePairs = (memories.length * (memories.length - 1)) / 2
  if (possiblePairs === 0) return 1

  // Ratio of agreement-pairs to possible-pairs, clamped.
  // When multiple tokens agree we can exceed 1 — clamp to keep the
  // invariant that a fully-corroborated surface reports 1.
  return Math.min(1, agreementPairs / possiblePairs)
}

// ---------------------------------------------------------------------------
// Tokenisation
//
// We want tokens that carry fact-identity: entity names (capitalised words,
// multi-word sequences), verbs, domains. Stop-words and connectors are
// noise. Lowercase, drop short tokens, drop a small stop-list.
// ---------------------------------------------------------------------------

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'they', 'them', 'their',
  'about', 'into', 'over', 'under', 'where', 'when', 'what', 'which', 'while',
  'related', 'recent', 'events', 'relationships',
])

function extractSalientTokens(description: string): readonly string[] {
  if (!description) return []
  const tokens: string[] = []
  for (const raw of description.split(/[\s,;:()\[\]<>\-]+/)) {
    const tok = raw.trim().toLowerCase().replace(/[^a-z0-9@.]/g, '')
    if (tok.length < 4) continue
    if (STOP_TOKENS.has(tok)) continue
    tokens.push(tok)
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Hedge note builder
//
// The caller injects this string as an operator note in the system prompt,
// so it needs to be a concise instruction addressable by the model. Avoid
// end-user phrasing — this is machine-to-machine.
// ---------------------------------------------------------------------------

function buildHedgeNote(
  verdict: AssessVerdict,
  meta: { staleCount: number; totalCount: number; corroborationScore: number },
): string {
  if (verdict === 'ok') return ''

  if (verdict === 'refresh_required') {
    return [
      `[assess] Memory coverage is stale (${meta.staleCount}/${meta.totalCount} surfaced items exceed freshness thresholds).`,
      `Before giving a verdict or recommendation, verify current state with a fresh lookup`,
      `(search_gmail, search_messages, or the equivalent tool for the subject).`,
      `Do not assert facts from memory alone. Prefer hedged phrasing such as`,
      `"based on what I have on file, which may be out of date...".`,
    ].join(' ')
  }

  // hedge
  return [
    `[assess] Retrieved memories weakly corroborate one another`,
    `(corroboration score ${meta.corroborationScore.toFixed(2)}).`,
    `Avoid verdict templates like "My verdict is...". Use hedged phrasing that`,
    `names the source ("per what's on file...") and invites correction.`,
  ].join(' ')
}

// ---------------------------------------------------------------------------
// Convenience: adapt ScoredItem[] → SurfacedMemoryLike[]
//
// The TAOR loop receives scored items via context-assembler; this keeps the
// wiring point trivial.
// ---------------------------------------------------------------------------

export function scoredItemsToSurfaced(items: readonly ScoredItem[]): SurfacedMemoryLike[] {
  return items.map(it => ({
    description: it.description,
    confidence: it.confidence,
    ageDays: it.ageDays,
    type: it.type,
    blendedScore: it.blendedScore,
  }))
}

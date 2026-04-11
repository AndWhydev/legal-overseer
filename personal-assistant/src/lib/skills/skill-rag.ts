/**
 * Skill RAG — per-turn skill selection based on message relevance.
 *
 * Mirrors tool-rag.ts pattern: tokenize message, score each skill by
 * keyword/tag/description overlap, return top candidates with token estimates.
 *
 * Performance: pure string matching on ~50 in-memory entries. Sub-millisecond.
 */

import type { SkillIndexEntry } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of skill candidates to surface to the planner */
const MAX_SKILL_CANDIDATES = 5

/** Maximum total estimated tokens for all candidates (budget pre-check) */
const MAX_CANDIDATE_TOKENS = 8000

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
// Types
// ---------------------------------------------------------------------------

export interface SkillRAGResult {
  /** Top skill candidates to pass to the planner */
  candidates: SkillCandidate[]
  /** Scoring details for observability */
  scores: Record<string, number>
}

export interface SkillCandidate {
  id: string
  name: string
  description: string
  estimatedTokens: number
  score: number
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Score and select the most relevant skills for a given user message.
 *
 * @param message     - The user's message text
 * @param skillIndex  - Skill entries to score (pre-filtered by role if swarm agent)
 * @param maxCandidates - Maximum candidates to return (default: 5)
 */
export function selectRelevantSkills(
  message: string,
  skillIndex: SkillIndexEntry[],
  maxCandidates: number = MAX_SKILL_CANDIDATES,
): SkillRAGResult {
  if (skillIndex.length === 0) {
    return { candidates: [], scores: {} }
  }

  const messageWords = tokenize(message)
  const messageWordSet = new Set(messageWords)
  const messageLower = message.toLowerCase()

  const scored: Array<{ entry: SkillIndexEntry; score: number }> = []
  const scores: Record<string, number> = {}

  for (const entry of skillIndex) {
    const score = scoreSkill(entry, messageWords, messageWordSet, messageLower)
    scores[entry.id] = score
    if (score > 0) {
      scored.push({ entry, score })
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Take top N, then enforce token budget
  const candidates: SkillCandidate[] = []
  let totalTokens = 0

  for (const { entry, score } of scored.slice(0, maxCandidates)) {
    if (totalTokens + entry.estimatedTokens > MAX_CANDIDATE_TOKENS) continue
    candidates.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      estimatedTokens: entry.estimatedTokens,
      score,
    })
    totalTokens += entry.estimatedTokens
  }

  return { candidates, scores }
}

// ---------------------------------------------------------------------------
// Scoring internals
// ---------------------------------------------------------------------------

function scoreSkill(
  entry: SkillIndexEntry,
  messageWords: string[],
  messageWordSet: Set<string>,
  messageLower: string,
): number {
  let score = 0

  // 1. Name match — skill ID parts in the message (+3 each)
  const nameWords = entry.id.split('-')
  for (const word of nameWords) {
    if (word.length > 2 && messageLower.includes(word)) {
      score += 3
    }
  }

  // 2. Tag match — topic tags in the message (+2 each)
  for (const tag of entry.tags) {
    if (messageWordSet.has(tag.toLowerCase()) || messageLower.includes(tag.toLowerCase())) {
      score += 2
    }
  }

  // 3. Trigger keyword match — high-signal exact hits (+3 each)
  for (const keyword of entry.triggerKeywords) {
    if (messageLower.includes(keyword.toLowerCase())) {
      score += 3
    }
  }

  // 4. Description overlap — word overlap normalized by length (+1 per word, capped)
  const descWords = tokenize(entry.description)
  let descOverlap = 0
  for (const word of descWords) {
    if (messageWordSet.has(word)) {
      descOverlap++
    }
  }
  if (descWords.length > 0) {
    score += (descOverlap / descWords.length) * 2
  }

  // 5. Bigram match — two-word phrases matching skill name (+4)
  if (messageWords.length >= 2) {
    const nameBigram = entry.id.replace(/-/g, ' ')
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
 * Tokenize text into lowercase words, filtering stop words and short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

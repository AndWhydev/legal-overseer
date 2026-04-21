/**
 * Test-utterance detector — pre-flight heuristic that catches mic-check /
 * echo-test inputs so they don't get routed to a send-intent classifier.
 *
 * Why: a live conversation on 2026-04-17 showed "Testing, testing" being
 * treated as an iMessage send request twice in a row. The agent asked for
 * a phone number, then asked again, then attempted a send. The user had
 * no intent beyond confirming voice capture worked.
 *
 * This runs in Step 1 of the TAOR loop, right after pre-flight. On a
 * confident match the loop short-circuits with a canned ack — no tool
 * selection, no memory write, no action queue, no model call.
 */

// ---------------------------------------------------------------------------
// Pattern table
//
// Each entry: pattern + confidence contribution when it fires. The final
// confidence is min(1.0, sum_of_matched_weights). Two weaker signals can
// combine into a confident match; one strong signal alone can also trip.
// ---------------------------------------------------------------------------

interface TestPattern {
  readonly re: RegExp
  readonly weight: number
  readonly label: string
}

const TEST_PATTERNS: readonly TestPattern[] = [
  // Strong, unambiguous echo tests.
  { re: /^\s*testing[,.\s]+testing(?:[,.\s]+testing)?/i, weight: 1.0, label: 'testing-testing' },
  { re: /^\s*mic(?:rophone)?\s+check\b/i, weight: 1.0, label: 'mic-check' },
  { re: /^\s*sound\s+check\b/i, weight: 1.0, label: 'sound-check' },
  { re: /^\s*check\s*,?\s*check\s*,?\s*(?:one|1)?\s*,?\s*(?:two|2)?/i, weight: 1.0, label: 'check-check' },
  { re: /^\s*(?:1|one)\s*,?\s*(?:2|two)\s*,?\s*(?:3|three)\s*$/i, weight: 1.0, label: 'one-two-three' },

  // Moderate: "can you hear me" style.
  { re: /^\s*(?:can|do)\s+you\s+(?:hear|read)\s+me\s*\??/i, weight: 0.9, label: 'can-you-hear-me' },
  { re: /^\s*(?:is\s+)?(?:this|anything)\s+(?:thing\s+)?(?:on|working)\s*\??/i, weight: 0.9, label: 'is-this-on' },

  // Weak signals that combine with voice-mode context.
  { re: /\btesting\s+(?:the\s+)?voice(?:\s+mode)?\b/i, weight: 0.9, label: 'testing-voice' },
  { re: /\bhello\s*,?\s*hello\b/i, weight: 0.7, label: 'hello-hello' },
  { re: /\b(?:loud|clear)(?:\s+and\s+(?:loud|clear))?\s*\??$/i, weight: 0.6, label: 'loud-and-clear-query' },
] as const

// ---------------------------------------------------------------------------
// Guard rails
//
// Some messages contain "testing" but are real requests (e.g. "testing our
// staging deploy broke, can you look?"). We do NOT want to ack those.
// These kill-switches drop confidence to 0 regardless of pattern matches.
// ---------------------------------------------------------------------------

const DISQUALIFIERS: readonly RegExp[] = [
  // Longer than a typical mic check — probably real content.
  /.{80,}/,
  // Contains request verbs. ("check" is deliberately excluded — it overlaps
  // with "mic check" / "sound check" / "check, check". Real-request "check"
  // cases like "check the calendar for tomorrow" don't match any positive
  // pattern so they fall through with score 0 anyway.)
  /\b(?:fix|send|email|invoice|schedule|book|look|find|show|list|get|draft|reply|call|remind)\b/i,
  // Contains a question mark *and* is longer than 30 chars — likely substantive.
  /\?.{15,}/,
  // Contains @ or a URL — likely real content.
  /@\w|https?:\/\//i,
] as const

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TestUtteranceResult {
  /** True when confidence is at or above threshold and no disqualifier fired. */
  readonly isTestUtterance: boolean
  /** 0.0 – 1.0. */
  readonly confidence: number
  /** Suggested canned acknowledgement when `isTestUtterance` is true. */
  readonly suggestedAck?: string
  /** Labels of matched patterns — useful for telemetry. */
  readonly matchedLabels: readonly string[]
}

/**
 * Default threshold: matches must aggregate to this score before we ack.
 * Set conservatively — false positives silently drop real requests, which
 * is worse than false negatives that fall through to the normal loop.
 */
export const TEST_UTTERANCE_THRESHOLD = 0.8

/**
 * Classify a user message as a test-utterance or not.
 *
 * Side-effect free. Safe to call on every turn.
 */
export function detectTestUtterance(
  message: string,
  opts?: { voiceMode?: boolean },
): TestUtteranceResult {
  const trimmed = (message ?? '').trim()
  if (!trimmed) {
    return { isTestUtterance: false, confidence: 0, matchedLabels: [] }
  }

  // Disqualifiers short-circuit before pattern matching.
  for (const dq of DISQUALIFIERS) {
    if (dq.test(trimmed)) {
      return { isTestUtterance: false, confidence: 0, matchedLabels: [] }
    }
  }

  let score = 0
  const matched: string[] = []
  for (const p of TEST_PATTERNS) {
    if (p.re.test(trimmed)) {
      score += p.weight
      matched.push(p.label)
    }
  }

  // Voice-mode context lifts weak matches slightly — a user in voice mode
  // saying "hello hello" is more likely testing than typing it in chat.
  if (opts?.voiceMode && score > 0 && score < 1) {
    score = Math.min(1, score + 0.15)
  }

  const confidence = Math.min(1, score)
  const isTestUtterance = confidence >= TEST_UTTERANCE_THRESHOLD

  return {
    isTestUtterance,
    confidence,
    matchedLabels: matched,
    suggestedAck: isTestUtterance ? pickAck(matched, opts?.voiceMode) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Ack selection
//
// Short, voice-friendly responses that don't demand a reply. The voice-mode
// variant skips punctuation-heavy phrasing.
// ---------------------------------------------------------------------------

function pickAck(matchedLabels: readonly string[], voiceMode?: boolean): string {
  const isMicCheck = matchedLabels.some(l =>
    l === 'mic-check' || l === 'sound-check' || l === 'testing-voice' || l === 'can-you-hear-me' || l === 'is-this-on',
  )
  if (voiceMode || isMicCheck) {
    return 'Loud and clear.'
  }
  return 'Got you — mic check received.'
}

// Response guard — detects and scrubs AI model/provider name leaks from LLM output

/**
 * Strip zero-width and invisible Unicode characters that can bypass pattern matching.
 */
function stripInvisible(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '')
}

const LEAK_PATTERNS = [
  /\bclaude\b/i,
  /\banthropic\b/i,
  /\bopenai\b/i,
  /\bgpt-[34]/i,
  /\bsonnet\b/i,
  /\bhaiku\b/i,
  /\bopus\b/i,
  /\bsystem prompt\b/i,
  /\bmy instructions\b/i,
  /\bi was (told|instructed|programmed) to\b/i,
  /\bas an ai( language)? model\b/i,
  /\bmy (training|guidelines|rules) (says?|tells?|instructs?|requires?)\b/i,
  /\bI('m| am) (a |an )?(large )?language model\b/i,
  /\bmy (creator|developer|maker)s? (at |is |are )/i,
]

const MAX_INPUT_LENGTH = 50_000

export function detectLeak(text: string): { leaked: boolean; patterns: string[] } {
  const normalized = stripInvisible(text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text)
  const hits = LEAK_PATTERNS.filter(p => p.test(normalized)).map(p => p.source)
  return { leaked: hits.length > 0, patterns: hits }
}

export function scrubLeaks(text: string): string {
  let scrubbed = stripInvisible(text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text)
  scrubbed = scrubbed.replace(/\bclaude\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\banthropic\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\bopenai\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\bGPT-[34][\w.-]*\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\bsonnet\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\bhaiku\b/gi, 'BitBit')
  scrubbed = scrubbed.replace(/\bopus\b/gi, 'BitBit')
  return scrubbed
}

/**
 * Polish response formatting — removes em-dashes and en-dashes,
 * replacing them with natural alternatives (commas, " to ", periods).
 * Run as post-processing on all assistant output.
 */
export function polishResponse(text: string): string {
  // Replace em-dashes (—) with comma-space
  let polished = text.replace(/—/g, ', ')
  // Replace en-dashes (–) between words with " to " (for ranges) or ", "
  // Context: if surrounded by digits, likely a range; otherwise list/separator
  polished = polished.replace(/\s+–\s+/g, (match, offset) => {
    // Check if this is a numeric range (e.g., "2020 – 2025" or "10 – 20")
    const before = polished[offset - 1]
    const after = polished[offset + 1]
    if (/\d/.test(before) && /\d/.test(after)) {
      return ' to '
    }
    return ', '
  })
  return polished
}

// ─── Humanizer ────────────────────────────────────────────────────────────────
// Synchronous, zero-latency post-processing that enforces SOUL.md voice rules
// on ALL outbound text. Strips AI writing tells, enforces collective voice,
// and normalizes quality across model tiers (Haiku/Sonnet/Opus).

/** AI opener phrases that should be stripped entirely */
const AI_OPENERS = [
  /^certainly[!.]?\s*/i,
  /^of course[!.]?\s*/i,
  /^absolutely[!.]?\s*/i,
  /^sure thing[!.]?\s*/i,
  /^great question[!.]?\s*/i,
  /^that's a great question[!.]?\s*/i,
  /^good question[!.]?\s*/i,
  /^I'd be happy to help[!.]?\s*/i,
  /^I'd be glad to\s*/i,
  /^I can help (you )?with that[!.]?\s*/i,
  /^let me help you with that[!.]?\s*/i,
  /^here's what I found[.:]\s*/i,
  /^here is what I found[.:]\s*/i,
]

/** AI filler phrases that add no value */
const AI_FILLERS = [
  /\bit('s| is) important to note that\s*/gi,
  /\bit('s| is) worth noting that\s*/gi,
  /\bit('s| is) worth mentioning that\s*/gi,
  /\bI should note that\s*/gi,
  /\bI should mention that\s*/gi,
  /\bI want to emphasize that\s*/gi,
  /\bplease note that\s*/gi,
  /\bplease keep in mind that\s*/gi,
  /\bas mentioned (earlier|above|before),?\s*/gi,
  /\bas I mentioned,?\s*/gi,
  /\bin conclusion,?\s*/gi,
  /\bin summary,?\s*/gi,
  /\bto summarize,?\s*/gi,
  /\boverall,?\s*/gi,
  /\bfurthermore,?\s*/gi,
  /\bmoreover,?\s*/gi,
  /\badditionally,?\s*/gi,
  /\bnevertheless,?\s*/gi,
  /\bnonetheless,?\s*/gi,
  /\bhowever, it('s| is) important\s*/gi,
]

/** Tail phrases BitBit should never end with (SOUL.md: never ask what to do next).
 *  Order matters: longer/more-specific patterns first to avoid partial matches. */
const FORBIDDEN_TAILS = [
  /\s*is there anything else.*[?.]?\s*$/i,
  /\s*anything else I can help.*[?.]?\s*$/i,
  /\s*anything (else )?(you('d| would) like|you want|I can|you need) ?(me to)? ?(help|do|handle|look into|assist).*[?.]?\s*$/i,
  /\s*what (else )?(would you like|should I|can I|do you want|do you need).*[?.]?\s*$/i,
  /\s*let me know if (you |there('s| is) )?(need|want|anything|have).*[?.]?\s*$/i,
  /\s*do you (want|need) (me to|anything).*[?.]?\s*$/i,
  /\s*would you like me to.*[?.]?\s*$/i,
  /\s*shall I.*[?.]?\s*$/i,
  /\s*want me to.*[?.]?\s*$/i,
  /\s*feel free to (ask|reach out|let me know).*[?.]?\s*$/i,
  /\s*don't hesitate to (ask|reach out|let me know).*[?.]?\s*$/i,
  /\s*I'm here (if|to help|for).*[?.]?\s*$/i,
  /\s*happy to help.*[?.]?\s*$/i,
]

/** Possessive "your" → "our" for shared state (SOUL.md: collective voice) */
const COLLECTIVE_VOICE_RULES: Array<[RegExp, string]> = [
  [/\byour tasks?\b/gi, 'our tasks'],
  [/\byour pipeline\b/gi, 'our pipeline'],
  [/\byour inbox\b/gi, 'our inbox'],
  [/\byour contacts?\b/gi, 'our contacts'],
  [/\byour invoices?\b/gi, 'our invoices'],
  [/\byour schedule\b/gi, 'our schedule'],
  [/\byour calendar\b/gi, 'our calendar'],
  [/\byour emails?\b/gi, 'our emails'],
  [/\byour leads?\b/gi, 'our leads'],
  [/\byour projects?\b/gi, 'our projects'],
  [/\byour goals?\b/gi, 'our goals'],
  [/\byour clients?\b/gi, 'our clients'],
  [/\byour team\b/gi, 'our team'],
  [/\byour business\b/gi, 'our business'],
  [/\byour workspace\b/gi, 'our workspace'],
  [/\byour dashboard\b/gi, 'the dashboard'],
  [/\byou('ve| have) got\b/gi, "we've got"],
  [/\byou have (\d+)/gi, 'we have $1'],
]

/** "I checked/searched/found" → remove the "I" framing */
const SELF_REFERENTIAL = [
  [/\bI (checked|searched|looked up|found|pulled up|reviewed|scanned|analyzed|read)\b/gi, '$1'],
  [/\bI('ve| have) (checked|searched|looked up|found|pulled up|reviewed|scanned|analyzed|read)\b/gi, '$2'],
] as const

/**
 * Humanize a complete text response. Enforces SOUL.md voice rules:
 * - Strips AI openers (Certainly!, Of course!, Great question!)
 * - Strips AI filler phrases (It's important to note, Furthermore)
 * - Strips forbidden tail phrases (Let me know if you need anything)
 * - Enforces collective voice (your → our for shared state)
 * - Removes self-referential framing (I checked → Checked)
 * - Removes em-dashes (SOUL.md: Never use em-dashes)
 * - Strips excessive exclamation marks
 *
 * This is synchronous and safe to call on every response. Idempotent on clean text.
 */
export function humanize(text: string): string {
  if (!text || text.length === 0) return text

  let h = text

  // 1. Strip AI openers (only at start of text)
  for (const pattern of AI_OPENERS) {
    h = h.replace(pattern, '')
  }

  // 2. Strip AI fillers throughout
  for (const pattern of AI_FILLERS) {
    h = h.replace(pattern, '')
  }

  // 3. Strip forbidden tail phrases
  for (const pattern of FORBIDDEN_TAILS) {
    h = h.replace(pattern, '')
  }

  // 4. Enforce collective voice
  for (const [pattern, replacement] of COLLECTIVE_VOICE_RULES) {
    h = h.replace(pattern, replacement)
  }

  // 5. Remove self-referential framing
  for (const [pattern, replacement] of SELF_REFERENTIAL) {
    h = h.replace(pattern, replacement)
  }

  // 6. Polish formatting (em-dashes, en-dashes)
  h = polishResponse(h)

  // 7. Tame excessive exclamation marks (2+ → 1)
  h = h.replace(/!{2,}/g, '!')

  // 8. Clean up double spaces left by removals
  h = h.replace(/ {2,}/g, ' ')

  // 9. Fix capitalization after sentence boundaries where filler removal left lowercase
  h = h.replace(/([.!?]\s+)([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase())

  // 10. Capitalize first letter if we stripped the opener
  if (h.length > 0 && h !== text) {
    h = h.charAt(0).toUpperCase() + h.slice(1)
  }

  // 10. Trim leading/trailing whitespace
  h = h.trim()

  return h
}

/**
 * Full outbound text pipeline: scrub leaks → humanize.
 * Use this as the single entry point for all text leaving the engine.
 */
export function guardAndHumanize(text: string): string {
  return humanize(scrubLeaks(text))
}

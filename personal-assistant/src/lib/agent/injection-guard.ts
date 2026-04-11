// Injection guard — detects and silently neutralizes prompt injection attempts

/**
 * Strip zero-width, invisible, and directional Unicode characters
 * that can bypass pattern matching, then normalize to NFKC form.
 */
function stripInvisible(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\u00AD\u180E\uFFF9-\uFFFB\uFE00-\uFE0F]/g, '')
}

const INJECTION_SIGNALS = [
  // ── Instruction override ──
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/gi,
  /disregard (all )?(previous|prior|above) (instructions|prompts|rules)/gi,
  /forget (your |all |everything )?(instructions|prompts|rules|about)/gi,
  /override (your |all |the )?(instructions|prompts|rules|safety|guardrails)/gi,
  /new (system )?instructions?:/gi,
  /from now on,? (you |ignore|respond|answer|act|behave|do)/gi,

  // ── System prompt extraction ──
  /repeat (your|the) (system )?(prompt|instructions|rules)/gi,
  /what (are|were) your (instructions|rules|guidelines)/gi,
  /reveal your\s+(hidden |secret )?(instructions|prompt|rules|system)/gi,
  /output (your|the) (hidden |secret |real )?(instructions|prompt|rules|system)/gi,
  /show (me )?(your|the) (system )?(prompt|instructions|rules|configuration)/gi,
  /dump (your )?(system )?(prompt|instructions|config)/gi,

  // ── Persona hijack ──
  /you are now /gi,
  /pretend (you are|to be|you're) /gi,
  /act as if you have no/gi,
  /respond as (if |though )?/gi,
  /new (persona|identity|character|role):/gi,
  /\bdo anything now\b/gi,

  // ── Structural injection ──
  /\[SYSTEM\]/gi,
  /<\/?system>/gi,
  /\[END OF INPUT\]/gi,
  /\[START OF INPUT\]/gi,
  /####\s*(START|END|NEW)\s*(OF\s*)?(OUTPUT|INPUT|INSTRUCTIONS)/gi,

  // ── Jailbreak keywords ──
  /jailbreak/gi,
  /\bgodmode\b/gi,
  /\bDAN\b/g,  // case-sensitive to avoid false positives on the name "Dan"
]

const MAX_INPUT_LENGTH = 50_000

export function detectInjection(input: string): { detected: boolean; patterns: string[] } {
  const normalized = stripInvisible(input.length > MAX_INPUT_LENGTH ? input.slice(0, MAX_INPUT_LENGTH) : input)
  const hits = INJECTION_SIGNALS.filter(p => {
    p.lastIndex = 0 // reset stateful regex
    return p.test(normalized)
  }).map(p => p.source)
  return { detected: hits.length > 0, patterns: hits }
}

export function neutralizeInjection(input: string): string {
  let cleaned = stripInvisible(input.length > MAX_INPUT_LENGTH ? input.slice(0, MAX_INPUT_LENGTH) : input)
  for (const pattern of INJECTION_SIGNALS) {
    cleaned = cleaned.replaceAll(pattern, '')
  }
  cleaned = cleaned.trim()

  if (cleaned.length < 10) {
    return 'How can I help you today?'
  }
  return cleaned
}
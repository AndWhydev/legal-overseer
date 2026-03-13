// Injection guard — detects and silently neutralizes prompt injection attempts

/**
 * Strip zero-width and invisible Unicode characters that can bypass pattern matching.
 */
function stripInvisible(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060\u180E]/g, '')
}

const INJECTION_SIGNALS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/gi,
  /repeat (your|the) (system )?(prompt|instructions|rules)/gi,
  /what (are|were) your (instructions|rules|guidelines)/gi,
  /you are now /gi,
  /new (system )?instructions?:/gi,
  /\[SYSTEM\]/gi,
  /<\/?system>/gi,
  /reveal your\s+(hidden |secret )?(instructions|prompt|rules|system)/gi,
  /act as if you have no/gi,
  /pretend (you are|to be|you're) /gi,
  /\bdo anything now\b/gi,
  /jailbreak/gi,
]

export function detectInjection(input: string): { detected: boolean; patterns: string[] } {
  const normalized = stripInvisible(input)
  const hits = INJECTION_SIGNALS.filter(p => {
    p.lastIndex = 0 // reset stateful regex
    return p.test(normalized)
  }).map(p => p.source)
  return { detected: hits.length > 0, patterns: hits }
}

export function neutralizeInjection(input: string): string {
  let cleaned = stripInvisible(input)
  for (const pattern of INJECTION_SIGNALS) {
    cleaned = cleaned.replaceAll(pattern, '')
  }
  cleaned = cleaned.trim()

  if (cleaned.length < 10) {
    return 'How can I help you today?'
  }
  return cleaned
}

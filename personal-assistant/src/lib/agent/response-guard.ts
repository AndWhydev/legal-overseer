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

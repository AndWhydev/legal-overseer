/**
 * Incremental sentence splitter for voice TTS streaming.
 *
 * Consumes the accumulating `content_delta` text from the TAOR loop and
 * yields whole sentences as soon as they're complete. This is what lets us
 * start synthesising speech before the model has finished generating.
 *
 * Design constraints:
 *   - Must handle streaming: the input arrives in small chunks, potentially
 *     mid-word. Partial text is buffered.
 *   - Must not false-flush on common abbreviations ("e.g.", "Mr.", "etc.").
 *   - Must not false-flush on decimals ("3.14") or ellipses.
 *   - Short fragments (<MIN_FLUSH_CHARS) are held and concatenated with the
 *     following sentence — emitting "Hi." alone would mean a tiny TTS call
 *     with bad prosody.
 *   - `flush()` is called at end-of-response to drain the remainder.
 *
 * Algorithm:
 *   - `buffer` holds text past the last emitted sentence.
 *   - `scanPos` is the index within `buffer` we've already scanned past.
 *   - On each push, scan forward from `scanPos` for the next terminator.
 *   - When a complete-boundary terminator is found:
 *       * If (buffer[0..flushAt]) length >= MIN_FLUSH_CHARS → emit it,
 *         trim buffer to remainder, reset scanPos to 0.
 *       * Else → advance scanPos past this terminator and keep scanning
 *         for the NEXT boundary. The short fragment stays in `buffer` and
 *         will be emitted together with whatever follows.
 */

const MIN_FLUSH_CHARS = 15

// Words that commonly end in a period but should NOT terminate a sentence.
// Lowercased; compared case-insensitively. Includes multi-dot forms like "e.g".
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'e.g', 'i.e', 'etc', 'vs', 'viz', 'cf',
  'inc', 'corp', 'co', 'ltd',
  'a.m', 'p.m', 'u.s', 'u.k',
  'no', 'vol', 'fig',
])

function isTerminator(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?'
}

/** `.` that's part of "3.14" or "Mr." / "e.g." style abbreviations. */
function isAbbreviationOrDecimal(buf: string, index: number): boolean {
  if (buf[index] !== '.') return false

  const prev = buf[index - 1]
  const next = buf[index + 1]
  // Decimal: digit-dot-digit
  if (prev && /\d/.test(prev) && next && /\d/.test(next)) return true

  // Gather the immediately-preceding word (letters + embedded dots)
  let start = index - 1
  while (start >= 0 && /[A-Za-z.]/.test(buf[start])) start--
  start++
  const word = buf.slice(start, index).toLowerCase()
  return ABBREVIATIONS.has(word)
}

export interface SentenceSplitter {
  /** Feed a new chunk of streamed text. Returns any completed sentences. */
  push(chunk: string): string[]
  /** Drain the remaining buffered text (even if below MIN_FLUSH_CHARS). */
  flush(): string[]
  /** Current buffered content (diagnostic). */
  readonly pending: string
}

export function createSentenceSplitter(): SentenceSplitter {
  let buffer = ''
  let scanPos = 0

  function scan(): string[] {
    const out: string[] = []

    while (scanPos < buffer.length) {
      const ch = buffer[scanPos]

      // Paragraph break — always a hard boundary, no short-length guard.
      if (ch === '\n' && buffer[scanPos + 1] === '\n') {
        const sentence = buffer.slice(0, scanPos).trim()
        buffer = buffer.slice(scanPos + 2)
        scanPos = 0
        if (sentence) out.push(sentence)
        continue
      }

      if (!isTerminator(ch)) {
        scanPos++
        continue
      }

      // Period: check for abbreviation/decimal
      if (ch === '.' && isAbbreviationOrDecimal(buffer, scanPos)) {
        scanPos++
        continue
      }

      // Collapse runs of terminators ("...", "!!", "?!").
      let end = scanPos
      while (end + 1 < buffer.length && isTerminator(buffer[end + 1])) end++

      // Boundary requires whitespace (or end-of-stream) after the terminator.
      const afterIdx = end + 1
      if (afterIdx >= buffer.length) {
        // Wait for more input before deciding.
        return out
      }
      if (!/\s/.test(buffer[afterIdx])) {
        // Not a real boundary — skip past this terminator and keep scanning.
        scanPos = end + 1
        continue
      }

      // Candidate sentence: buffer[0..end]
      const candidate = buffer.slice(0, end + 1).trim()

      if (candidate.length >= MIN_FLUSH_CHARS) {
        out.push(candidate)
        buffer = buffer.slice(end + 1).replace(/^\s+/, '')
        scanPos = 0
      } else {
        // Too short to flush alone — swallow this boundary and keep going.
        // The pending short text stays in `buffer` and will join the next
        // sentence when emitted.
        scanPos = end + 1
      }
    }

    return out
  }

  return {
    push(chunk: string) {
      if (!chunk) return []
      buffer += chunk
      return scan()
    },
    flush() {
      const remaining = buffer.trim()
      buffer = ''
      scanPos = 0
      return remaining ? [remaining] : []
    },
    get pending() {
      return buffer
    },
  }
}

/**
 * Strips markdown/formatting that doesn't translate to speech.
 * Call on each sentence before handing to TTS.
 */
export function stripMarkdownForSpeech(text: string): string {
  return text
    // Code fences (shouldn't reach here in voice mode, but belt-and-braces)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Bold / italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Headings
    .replace(/^#{1,6}\s+/gm, '')
    // Links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // List bullets at line start
    .replace(/^\s*[-*+]\s+/gm, '')
    // Blockquotes
    .replace(/^\s*>\s?/gm, '')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

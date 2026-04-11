/**
 * Citation Extractor Utility
 *
 * Provides utilities for extracting citations from text, tool results,
 * and detecting topic shifts in message history for the BitBit agent engine.
 */

/**
 * Represents a single citation with metadata.
 */
export interface Citation {
  /** Numeric index of the citation (e.g., 1 for [1]) */
  index: number
  /** URL of the cited resource */
  url: string
  /** Title of the cited resource */
  title: string
  /** Optional description or snippet from the resource */
  description?: string
}

/**
 * Extracts citations from text containing [1], [2] style references.
 *
 * Parses text to find all citation markers like [1], [2], etc., and returns
 * the corresponding Citation objects from the provided map in the order they
 * appear in the text.
 *
 * @param text - The text containing citation references
 * @param citationMap - Map of citation indices to Citation objects
 * @returns Array of Citation objects in order of appearance, missing citations omitted
 *
 * @example
 * const text = "Check reference [1] and [2] for details.";
 * const citations = extractCitationsFromText(text, citationMap);
 */
export function extractCitationsFromText(
  text: string,
  citationMap: Map<number, Citation>
): Citation[] {
  if (!text || typeof text !== 'string') {
    return []
  }

  if (!(citationMap instanceof Map)) {
    return []
  }

  const citations: Citation[] = []
  const seen = new Set<number>()

  // Match all [N] style references where N is a number
  const citationRegex = /\[(\d+)\]/g
  let match: RegExpExecArray | null

  while ((match = citationRegex.exec(text)) !== null) {
    const index = parseInt(match[1], 10)

    // Only process if not already added and citation exists in map
    if (!seen.has(index) && citationMap.has(index)) {
      const citation = citationMap.get(index)
      if (citation) {
        citations.push(citation)
        seen.add(index)
      }
    }
  }

  return citations
}

/**
 * Web search result object shape for common API responses.
 */
interface WebSearchResult {
  url?: string
  title?: string
  snippet?: string
  description?: string
  link?: string
  name?: string
  displayLink?: string
  htmlSnippet?: string
}

/**
 * Extracts citations from web search tool results.
 *
 * Handles multiple web search API formats including Google Search,
 * Web Results, and generic citation arrays. Automatically indexes
 * results and converts them to Citation objects.
 *
 * @param toolName - Name of the tool that produced the results (e.g., "google_search", "web_search")
 * @param result - The tool result object
 * @returns Array of Citation objects with sequential indices
 *
 * @example
 * const citations = extractCitationsFromToolResult("google_search", {
 *   results: [
 *     { url: "https://example.com", title: "Example" },
 *     { url: "https://example2.com", title: "Example 2" }
 *   ]
 * });
 */
export function extractCitationsFromToolResult(
  toolName: string,
  result: unknown
): Citation[] {
  if (!result || typeof result !== 'object') {
    return []
  }

  const results = result as Record<string, unknown>
  const citations: Citation[] = []
  let items: WebSearchResult[] = []

  // Try multiple common result formats
  if (Array.isArray(results.results)) {
    items = results.results as WebSearchResult[]
  } else if (Array.isArray(results.searchResults)) {
    items = results.searchResults as WebSearchResult[]
  } else if (Array.isArray(results.items)) {
    items = results.items as WebSearchResult[]
  } else if (Array.isArray(results.citations)) {
    items = results.citations as WebSearchResult[]
  } else if (Array.isArray(result)) {
    items = result as WebSearchResult[]
  }

  // Convert search results to citations with sequential indexing
  items.forEach((item, index) => {
    if (item && typeof item === 'object') {
      const url = (item.url || item.link || item.displayLink || '') as string
      const title = (item.title || item.name || '') as string
      const description = (
        item.description ||
        item.snippet ||
        item.htmlSnippet ||
        ''
      ) as string

      if (url && title) {
        citations.push({
          index: index + 1,
          url: String(url).trim(),
          title: String(title).trim(),
          description: description ? String(description).trim() : undefined,
        })
      }
    }
  })

  // Handle web_read — single URL source
  if (items.length === 0 && typeof results.url === 'string' && typeof results.title === 'string') {
    citations.push({
      index: citations.length + 1,
      url: String(results.url).trim(),
      title: String(results.title).trim(),
      description: results.provider ? `Read via ${results.provider}` : undefined,
    })
  }

  return citations
}

/**
 * Computes a simple word-based similarity score between two strings.
 *
 * Normalizes strings, extracts tokens, and calculates Jaccard similarity
 * based on common words. Non-content words (articles, prepositions) are ignored.
 *
 * @param text1 - First text to compare
 * @param text2 - Second text to compare
 * @returns Similarity score between 0 (no overlap) and 1 (identical)
 *
 * @internal
 */
function computeSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) {
    return 0
  }

  // Common stop words to ignore
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
  ])

  // Tokenize and filter
  const tokens1 = new Set(
    text1
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0 && !stopWords.has(token))
  )

  const tokens2 = new Set(
    text2
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0 && !stopWords.has(token))
  )

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0
  }

  // Jaccard similarity: intersection / union
  let intersection = 0
  tokens1.forEach((token) => {
    if (tokens2.has(token)) {
      intersection++
    }
  })

  const union = tokens1.size + tokens2.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Extracts citations from RAG search_memory tool results.
 *
 * Parses communications search results and converts them to Citation objects
 * with formatted descriptions including sender, channel, and date.
 *
 * @param toolName - Name of the tool (checked against 'search_memory')
 * @param result - The tool result object from search_memory
 * @returns Array of Citation objects with sequential indices
 *
 * @example
 * const citations = extractRAGCitations("search_memory", {
 *   results: [
 *     {
 *       source: "communications",
 *       entries: [
 *         { sender: "Dave", channel: "gmail", date: "2024-03-15", subject: "Invoice" }
 *       ]
 *     }
 *   ]
 * });
 */
export function extractRAGCitations(toolName: string, result: unknown): Citation[] {
  if (toolName !== 'search_memory' || !result || typeof result !== 'object') {
    return []
  }

  const data = result as Record<string, unknown>
  const results = data.results as Array<{ source: string; entries: unknown[] }> | undefined
  if (!Array.isArray(results)) return []

  const citations: Citation[] = []
  let index = 1

  for (const group of results) {
    if (group.source !== 'communications') continue
    const entries = group.entries as Array<Record<string, unknown>>

    for (const entry of entries) {
      const channel = (entry.channel as string) || ''
      const sender = (entry.sender as string) || ''
      const date = (entry.date as string) || ''
      const subject = (entry.subject as string) || ''

      if (sender || subject) {
        citations.push({
          index,
          url: '', // No URL for internal communications
          title: subject || `${channel} message from ${sender}`,
          description: `${sender} via ${channel}${date ? ` on ${new Date(date).toLocaleDateString()}` : ''}`,
        })
        index++
      }
    }
  }

  return citations
}

/**
 * Detects if a topic shift occurred between the last two messages.
 *
 * Compares the last two messages in the history for semantic similarity
 * using word overlap analysis. If similarity falls below the threshold,
 * a topic shift is detected.
 *
 * @param messageHistory - Array of message strings in chronological order
 * @param threshold - Similarity threshold (default: 0.3). Score below this indicates topic shift
 * @returns true if topic shift detected (similarity < threshold), false otherwise
 *
 * @example
 * const shifted = detectTopicShift(
 *   ["Tell me about weather", "What's the capital of France?"],
 *   0.3
 * ); // true - likely a topic shift
 */
export function detectTopicShift(
  messageHistory: string[],
  threshold = 0.3
): boolean {
  if (!Array.isArray(messageHistory) || messageHistory.length < 2) {
    return false
  }

  // Validate threshold
  const validThreshold = Math.max(0, Math.min(1, Number(threshold) || 0.3))

  // Get last two messages
  const lastMessage = messageHistory[messageHistory.length - 1]
  const secondLastMessage = messageHistory[messageHistory.length - 2]

  if (!lastMessage || !secondLastMessage) {
    return false
  }

  // Compute similarity and compare with threshold
  const similarity = computeSimilarity(secondLastMessage, lastMessage)

  return similarity < validThreshold
}

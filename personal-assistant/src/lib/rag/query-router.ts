/**
 * Adaptive Query Router (Phase 39-01)
 *
 * Classifies incoming queries by complexity and returns retrieval
 * configuration that scales compute budget accordingly:
 *   - simple:   BM25 only, topK=5, 500 tokens
 *   - moderate: BM25 + dense + graph, topK=10, 1500 tokens
 *   - complex:  BM25 + dense + graph + rerank, topK=20, 3000 tokens
 */

export type QueryComplexity = 'simple' | 'moderate' | 'complex'

export interface ClassificationResult {
  complexity: QueryComplexity
  score: number
  signals: string[]
}

export interface RetrievalConfig {
  useGraph: boolean
  useRerank: boolean
  topK: number
  tokenBudget: number
  searchModes: ('bm25' | 'dense' | 'graph')[]
}

const TEMPORAL_REGEX = /\b(last|this|next|yesterday|today|tomorrow|ago|week|month|year|january|february|march|april|may|june|july|august|september|october|november|december|recently|lately|since|before|after|during)\b/i

const RELATIONAL_REGEX = /\b(about|between|related?|relate|affect|impact|connection|how does|how do|compared?|versus|vs)\b/i

export function classifyQuery(query: string): ClassificationResult {
  if (!query || query.length < 3) return { complexity: 'simple', score: 0, signals: [] }

  const signals: string[] = []
  let score = 0

  // Signal 1: Multiple entities (capitalized words not at sentence start)
  const words = query.split(/\s+/)
  const capitalizedNonStarters = words.filter((w, i) =>
    i > 0 && w.length > 1 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()
  )
  if (capitalizedNonStarters.length > 1) { score++; signals.push('multi_entity') }

  // Signal 2: Temporal markers
  if (TEMPORAL_REGEX.test(query)) { score++; signals.push('temporal') }

  // Signal 3: Query length > 50
  if (query.length > 50) { score++; signals.push('long_query') }

  // Signal 4: Relational keywords
  if (RELATIONAL_REGEX.test(query)) { score++; signals.push('relational') }

  const complexity: QueryComplexity = score <= 1 ? 'simple' : score === 2 ? 'moderate' : 'complex'
  return { complexity, score, signals }
}

const CONFIGS: Record<QueryComplexity, RetrievalConfig> = {
  simple:   { useGraph: false, useRerank: false, topK: 5,  tokenBudget: 500,  searchModes: ['bm25'] },
  moderate: { useGraph: true,  useRerank: false, topK: 10, tokenBudget: 1500, searchModes: ['bm25', 'dense', 'graph'] },
  complex:  { useGraph: true,  useRerank: true,  topK: 20, tokenBudget: 3000, searchModes: ['bm25', 'dense', 'graph'] },
}

export function getRetrievalConfig(complexity: QueryComplexity): RetrievalConfig {
  return { ...CONFIGS[complexity] }
}

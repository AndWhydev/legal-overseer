// Stub — TDD RED phase

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

export function classifyQuery(_query: string): ClassificationResult {
  return { complexity: 'simple', score: 0, signals: [] }
}

export function getRetrievalConfig(_complexity: QueryComplexity): RetrievalConfig {
  return { useGraph: false, useRerank: false, topK: 0, tokenBudget: 0, searchModes: [] }
}

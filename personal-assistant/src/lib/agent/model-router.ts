export type ModelTier = 'opus' | 'sonnet' | 'haiku'

export interface ModelConfig {
  id: string
  tier: ModelTier
  maxTokens: number
  description: string
}

export interface ModelSelection {
  model: string
  reasoning: string
  tier: ModelTier
}

const models: Record<ModelTier, ModelConfig> = {
  opus: {
    id: 'claude-opus-4-20250514',
    tier: 'opus',
    maxTokens: 8192,
    description: 'Complex reasoning, strategy, planning, nuanced analysis',
  },
  sonnet: {
    id: 'claude-sonnet-4-5-20250929',
    tier: 'sonnet',
    maxTokens: 4096,
    description: 'Standard CRUD, search, analysis, tool use',
  },
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    tier: 'haiku',
    maxTokens: 2048,
    description: 'Classification, triage, routing, simple extraction',
  },
}

export function getModel(tier: ModelTier): ModelConfig {
  return models[tier]
}

export function getAllModels(): ModelConfig[] {
  return Object.values(models)
}

const opusTriggers = [
  'plan', 'strategy', 'analyze', 'compare', 'evaluate',
  'design', 'architect', 'optimize', 'recommend', 'prioritize',
  'what should', 'how should', 'why did', 'help me think',
  'trade-off', 'pros and cons', 'decision', 'explain why',
]

const haikuTriggers = [
  'classify', 'categorize', 'is this', 'yes or no',
  'which category', 'sort these', 'label', 'tag',
  'triage', 'filter', 'which one',
]

export function selectModel(prompt: string, context?: string): ModelSelection {
  const text = context ? `${prompt} ${context}` : prompt
  const lower = text.toLowerCase()

  const opusScore = opusTriggers.filter(t => lower.includes(t)).length
  if (opusScore >= 2) {
    return { model: models.opus.id, tier: 'opus', reasoning: `Matched ${opusScore} complex-reasoning triggers` }
  }

  const haikuScore = haikuTriggers.filter(t => lower.includes(t)).length
  if (haikuScore >= 2) {
    return { model: models.haiku.id, tier: 'haiku', reasoning: `Matched ${haikuScore} classification triggers` }
  }

  const wordCount = prompt.split(/\s+/).length
  const questionMarks = (prompt.match(/\?/g) || []).length
  const hasMultipleInstructions = prompt.includes('\n') && wordCount > 50
  const isLong = wordCount > 500

  if (hasMultipleInstructions || (wordCount > 100 && questionMarks >= 2) || isLong) {
    return { model: models.opus.id, tier: 'opus', reasoning: `Long/complex prompt (${wordCount} words, ${questionMarks} questions)` }
  }

  if (wordCount < 15 && questionMarks <= 1 && haikuScore >= 1) {
    return { model: models.haiku.id, tier: 'haiku', reasoning: `Short simple query (${wordCount} words)` }
  }

  return { model: models.sonnet.id, tier: 'sonnet', reasoning: 'Default: standard complexity' }
}

/** @deprecated Use selectModel instead */
export function routeToModel(message: string): ModelTier {
  return selectModel(message).tier
}

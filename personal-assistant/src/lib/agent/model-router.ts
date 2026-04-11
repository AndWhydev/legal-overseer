import { resolveModel, classifyPurpose, type ModelPurpose } from './model-registry'

export interface ModelSelection {
  model: string
  reasoning: string
  purpose: ModelPurpose
}

const synthesisTriggers = [
  'plan', 'strategy', 'analyze', 'compare', 'evaluate',
  'design', 'architect', 'optimize', 'recommend', 'prioritize',
  'what should', 'how should', 'why did', 'help me think',
  'trade-off', 'pros and cons', 'decision', 'explain why',
]

const classificationTriggers = [
  'classify', 'categorize', 'is this', 'yes or no',
  'which category', 'sort these', 'label', 'tag',
  'triage', 'filter', 'which one',
]

export function selectModel(prompt: string, context?: string): ModelSelection {
  const text = context ? `${prompt} ${context}` : prompt
  const lower = text.toLowerCase()

  const synthScore = synthesisTriggers.filter(t => lower.includes(t)).length
  if (synthScore >= 2) {
    return { model: resolveModel('synthesis'), purpose: 'synthesis', reasoning: `Matched ${synthScore} complex-reasoning triggers` }
  }

  const classScore = classificationTriggers.filter(t => lower.includes(t)).length
  if (classScore >= 2) {
    return { model: resolveModel('classification'), purpose: 'classification', reasoning: `Matched ${classScore} classification triggers` }
  }

  const wordCount = prompt.split(/\s+/).length
  const questionMarks = (prompt.match(/\?/g) || []).length
  const hasMultipleInstructions = prompt.includes('\n') && wordCount > 50
  const isLong = wordCount > 500

  if (hasMultipleInstructions || (wordCount > 100 && questionMarks >= 2) || isLong) {
    return { model: resolveModel('synthesis'), purpose: 'synthesis', reasoning: `Long/complex prompt (${wordCount} words, ${questionMarks} questions)` }
  }

  if (wordCount < 15 && questionMarks <= 1 && classScore >= 1) {
    return { model: resolveModel('classification'), purpose: 'classification', reasoning: `Short simple query (${wordCount} words)` }
  }

  return { model: resolveModel('conversation'), purpose: 'conversation', reasoning: 'Default: standard complexity' }
}

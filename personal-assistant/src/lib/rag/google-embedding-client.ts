/**
 * Google Text Embedding Client
 *
 * Uses Google's text-embedding-004 model (768 dimensions) for entity node embeddings.
 * Graceful degradation: returns empty array when GOOGLE_API_KEY is not set.
 */

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai'
import { logger } from '@/lib/core/logger'

const MODEL = 'text-embedding-004' // 768 dimensions

let client: GoogleGenerativeAI | null = null
let initialized = false

function getClient(): GoogleGenerativeAI | null {
  if (initialized) return client
  initialized = true

  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
  if (!key) {
    logger.warn('[google-embedding] GOOGLE_API_KEY or GEMINI_API_KEY not configured — embeddings unavailable')
    return null
  }

  client = new GoogleGenerativeAI(key)
  logger.info('[google-embedding] Client initialized', { model: MODEL })
  return client
}

/**
 * Embed text for document storage (768d).
 * Returns empty array on failure or missing API key.
 */
export async function embedText(
  text: string,
  taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT,
): Promise<number[]> {
  const maxRetries = 3

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ai = getClient()
      if (!ai) return []

      const model = ai.getGenerativeModel({ model: MODEL })
      const result = await model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType,
      })

      return result.embedding.values
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      logger.warn('[google-embedding] Failed after 3 attempts', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  return []
}

/**
 * Embed text for query/retrieval (768d).
 * Uses RETRIEVAL_QUERY task type for better query-document matching.
 */
export async function embedQuery(text: string): Promise<number[]> {
  return embedText(text, TaskType.RETRIEVAL_QUERY)
}

/**
 * Check if Google embedding is configured and ready.
 */
export function isGoogleEmbeddingConfigured(): boolean {
  return getClient() !== null
}

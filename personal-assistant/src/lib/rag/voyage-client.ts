/**
 * Voyage AI Embedding Client
 *
 * Handles text embedding via Voyage-3.5 for both indexing and query.
 * Graceful degradation: returns null when VOYAGE_API_KEY is not set.
 */

import { logger } from '@/lib/core/logger'

const VOYAGE_MODEL = 'voyage-3.5'
const BATCH_SIZE = 128
const MAX_RETRIES = 3

// Dynamic import to avoid Turbopack/ESM resolution issues with voyageai package
let voyageClient: any | null = null
let initialized = false

const runtimeRequireModule = (specifier: string) => (eval('require') as NodeJS.Require)(specifier) as { VoyageAIClient: new (options: { apiKey: string }) => any }

/**
 * Initialize Voyage AI client (lazy, single-shot)
 * Uses require() to avoid Turbopack ESM directory import issues at bundle time.
 */
function initializeVoyage(): void {
  if (initialized) return
  initialized = true

  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    logger.warn('Voyage API key not configured', {
      key: 'VOYAGE_API_KEY',
      message: 'Embeddings will be unavailable',
    })
    return
  }

  try {
    // Completely opaque require to prevent ANY bundler from analyzing voyageai.
    // The package has broken ESM directory imports and optional deps (@huggingface/transformers)
    // that crash Turbopack's resolver. This pattern is invisible to static analysis.
    const { VoyageAIClient } = runtimeRequireModule('voyageai')
    voyageClient = new VoyageAIClient({
      apiKey,
    })
    logger.info('Voyage AI client initialized', {
      model: VOYAGE_MODEL,
      batchSize: BATCH_SIZE,
    })
  } catch (err) {
    logger.error('Failed to initialize Voyage AI client', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Exponential backoff retry helper
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempt: number = 1,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      throw error
    }

    const backoffMs = Math.pow(2, attempt - 1) * 1000 // 1s, 2s, 4s
    logger.warn('Embedding request failed, retrying', {
      attempt,
      backoffMs,
      error: error instanceof Error ? error.message : String(error),
    })

    await new Promise((resolve) => setTimeout(resolve, backoffMs))
    return retryWithBackoff(fn, attempt + 1)
  }
}

/**
 * Embed multiple documents for vector storage.
 * Automatically chunks large batches into batches of 128.
 *
 * @param texts Array of document texts to embed
 * @returns Array of embedding vectors (one per text), or null if API is not configured
 */
export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  initializeVoyage()

  if (!voyageClient) {
    logger.warn('embedDocuments called but Voyage client not initialized')
    return null
  }

  if (texts.length === 0) {
    return []
  }

  const allEmbeddings: number[][] = []

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    try {
      const result: any = await retryWithBackoff(() =>
        voyageClient!.embed({
          input: batch,
          model: VOYAGE_MODEL,
          inputType: 'document',
        }),
      )

      // Extract embeddings from response
      if (result.data && result.data.length > 0) {
        for (const item of result.data) {
          if ('embedding' in item && Array.isArray((item as any).embedding)) {
            allEmbeddings.push((item as any).embedding)
          }
        }
      }

      logger.debug('Embedded document batch', {
        batchSize: batch.length,
        totalEmbedded: allEmbeddings.length,
      })
    } catch (error) {
      logger.error('Failed to embed document batch', {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  return allEmbeddings
}

/**
 * Embed a single query for vector search.
 *
 * @param text Query text to embed
 * @returns Single embedding vector, or null if API is not configured
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  initializeVoyage()

  if (!voyageClient) {
    logger.warn('embedQuery called but Voyage client not initialized')
    return null
  }

  try {
    const result: any = await retryWithBackoff(() =>
      voyageClient!.embed({
        input: text,
        model: VOYAGE_MODEL,
        inputType: 'query',
      }),
    )

    // Extract single embedding from response
    if (result.data && result.data.length > 0) {
      const item = result.data[0]
      if ('embedding' in item && Array.isArray((item as any).embedding)) {
        logger.debug('Embedded query', { textLength: text.length })
        return (item as any).embedding
      }
    }

    logger.warn('No embedding returned from Voyage API')
    return null
  } catch (error) {
    logger.error('Failed to embed query', {
      textLength: text.length,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Rerank documents using Voyage rerank API.
 */
export async function rerankDocuments(
  query: string,
  documents: Array<{ id: string; text: string }>,
  topK: number = 10,
): Promise<Array<{ id: string; score: number }>> {
  initializeVoyage()

  if (!voyageClient || documents.length === 0) {
    logger.debug('rerankDocuments: returning unranked fallback', {
      reason: !voyageClient ? 'client not initialized' : 'no documents',
    })
    return documents.slice(0, topK).map((doc, idx) => ({
      id: doc.id,
      score: 1.0 - idx * 0.01,
    }))
  }

  try {
    const result: any = await retryWithBackoff(() =>
      voyageClient!.rerank({
        query,
        documents: documents.map((d) => d.text),
        model: 'rerank-2',
        topK,
      }),
    )

    if (result.data && result.data.length > 0) {
      logger.debug('Reranked documents', { topK, count: result.data.length })
      return result.data.map((r: any) => ({
        id: documents[r.index ?? 0].id,
        score: r.relevanceScore ?? 0,
      }))
    }

    logger.warn('No reranking results returned from Voyage API')
    return documents.slice(0, topK).map((doc, idx) => ({
      id: doc.id,
      score: 1.0 - idx * 0.01,
    }))
  } catch (error) {
    logger.warn('Reranking failed, returning unranked fallback', {
      error: error instanceof Error ? error.message : String(error),
    })
    return documents.slice(0, topK).map((doc, idx) => ({
      id: doc.id,
      score: 1.0 - idx * 0.01,
    }))
  }
}

/**
 * Check if Voyage is configured and ready
 */
export function isVoyageConfigured(): boolean {
  initializeVoyage()
  return voyageClient !== null
}

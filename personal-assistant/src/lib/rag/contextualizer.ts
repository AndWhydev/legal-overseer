/**
 * Contextual Retrieval — Anthropic technique for chunk enrichment.
 * Prepends entity/speaker/topic context to chunks before embedding.
 * -67% retrieval failure at zero query-time cost.
 */

import { generateText } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import type { TextChunk } from './types'

export const CONTEXTUALIZE_ENABLED = process.env.CONTEXTUALIZE_CHUNKS !== 'false'

const MIN_CHUNK_LENGTH = 50
const CONTEXT_PROMPT = `<message>
From: {sender}
Subject: {subject}
Channel: {channel}

{fullText}
</message>

<chunk>{chunkText}</chunk>

Give a short context (1-2 sentences) to situate this chunk within the message.
Include: who is speaking/writing, what entity or project is discussed, approximate date context.
Answer only with the context, nothing else.`

export async function contextualizeChunks(
  chunks: TextChunk[],
  fullMessageText: string,
  metadata: { sender?: string; channel?: string; subject?: string }
): Promise<TextChunk[]> {
  if (!CONTEXTUALIZE_ENABLED || chunks.length === 0) return chunks

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      // Skip tiny chunks
      if (chunk.text.length < MIN_CHUNK_LENGTH) return chunk

      try {
        const prompt = CONTEXT_PROMPT
          .replace('{sender}', metadata.sender || 'Unknown')
          .replace('{subject}', metadata.subject || 'No subject')
          .replace('{channel}', metadata.channel || 'Unknown')
          .replace('{fullText}', fullMessageText.slice(0, 4000))
          .replace('{chunkText}', chunk.text.slice(0, 2000))

        const { text: context } = await generateText({
          model: models.fast,
          prompt,
          maxOutputTokens: 150,
        })

        if (context && context.length > 10) {
          return {
            ...chunk,
            text: context.trim() + '\n\n' + chunk.text,
          }
        }
        return chunk
      } catch {
        return chunk // Graceful degradation
      }
    })
  )

  const enrichedCount = results.filter((r, i) => r.text !== chunks[i].text).length
  logger.info(`[contextualizer] Enriched ${enrichedCount}/${chunks.length} chunks`)

  return results
}

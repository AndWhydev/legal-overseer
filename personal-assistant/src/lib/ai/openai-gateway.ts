/**
 * Resolves the OpenAI-compatible API base URL and auth headers for manual
 * fetch calls (Whisper transcription, TTS) that bypass the AI SDK.
 *
 * Audio endpoints (Whisper, TTS) always use the direct OpenAI API because
 * the Vercel AI Gateway only proxies chat/embedding model calls — it returns
 * 404 for /audio/* routes. OPENAI_API_KEY is required for these features.
 */

const DIRECT_OPENAI_BASE = 'https://api.openai.com/v1'

export interface OpenAIEndpoint {
  /** Base URL (no trailing slash), e.g. "https://api.openai.com/v1" */
  baseUrl: string
  /** Authorization header value, e.g. "Bearer sk-..." */
  authorization: string
}

/**
 * Returns the direct OpenAI endpoint for audio APIs (Whisper, TTS).
 * Requires OPENAI_API_KEY. Returns `null` if not configured.
 */
export function getOpenAIEndpoint(): OpenAIEndpoint | null {
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    return {
      baseUrl: DIRECT_OPENAI_BASE,
      authorization: `Bearer ${openaiKey}`,
    }
  }

  return null
}

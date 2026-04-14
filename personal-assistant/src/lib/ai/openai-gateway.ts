/**
 * Resolves the OpenAI-compatible API base URL and auth headers for manual
 * fetch calls (Whisper transcription, TTS) that bypass the AI SDK.
 *
 * Priority:
 *   1. Vercel AI Gateway via AI_GATEWAY_API_KEY — unified routing, cost tracking
 *   2. Direct OpenAI via OPENAI_API_KEY — legacy fallback
 *
 * The AI SDK's `gateway()` function handles this automatically for model calls,
 * but Whisper and TTS use raw `fetch()` and need explicit URL + auth.
 */

const GATEWAY_OPENAI_BASE = 'https://ai-gateway.vercel.sh/openai/v1'
const DIRECT_OPENAI_BASE = 'https://api.openai.com/v1'

export interface OpenAIEndpoint {
  /** Base URL (no trailing slash), e.g. "https://ai-gateway.vercel.sh/openai/v1" */
  baseUrl: string
  /** Authorization header value, e.g. "Bearer vck_..." */
  authorization: string
}

/**
 * Returns the OpenAI endpoint config, preferring AI Gateway.
 * Returns `null` if neither key is configured.
 */
export function getOpenAIEndpoint(): OpenAIEndpoint | null {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY
  if (gatewayKey) {
    return {
      baseUrl: GATEWAY_OPENAI_BASE,
      authorization: `Bearer ${gatewayKey}`,
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    return {
      baseUrl: DIRECT_OPENAI_BASE,
      authorization: `Bearer ${openaiKey}`,
    }
  }

  return null
}

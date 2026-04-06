/**
 * AI Gateway model references.
 *
 * Plain "provider/model" strings route through Vercel AI Gateway automatically.
 * No explicit provider setup needed — AI SDK resolves these via Gateway
 * with OIDC auth (Vercel deployments) or AI_GATEWAY_API_KEY (local dev).
 *
 * Auth priority: AI_GATEWAY_API_KEY env var → VERCEL_OIDC_TOKEN via @vercel/oidc
 *
 * To refresh local OIDC token: `vercel env pull .env.local --yes`
 */
export const models = {
  /** Classification, triage, quick parsing — cheapest and fastest */
  fast: 'google/gemini-3-flash' as const, // 6-8x cheaper than Haiku, faster, 1M context
  /** Conversation, general tasks — balanced cost/quality */
  balanced: 'anthropic/claude-sonnet-4.6' as const,
  /** Synthesis, deep analysis, complex reasoning — highest quality */
  heavy: 'anthropic/claude-opus-4.6' as const,
} as const

export type GatewayModelId = typeof models[keyof typeof models]

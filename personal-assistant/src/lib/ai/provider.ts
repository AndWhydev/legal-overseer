import { createAnthropic } from '@ai-sdk/anthropic'

/**
 * Shared Anthropic provider for AI SDK calls.
 * Uses ANTHROPIC_API_KEY from environment.
 */
export const anthropic = createAnthropic({})

/**
 * Model shortcuts matching the existing model-registry.ts purposes:
 * - fast: classification, quick parsing (Haiku)
 * - balanced: conversation, general tasks (Sonnet)
 * - heavy: synthesis, deep analysis (Opus)
 */
export const models = {
  fast: anthropic('claude-haiku-4-5-20251001'),
  balanced: anthropic('claude-sonnet-4-5-20250514'),
  heavy: anthropic('claude-opus-4-20250514'),
} as const

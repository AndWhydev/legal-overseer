/**
 * Token budget allocation and management for the context assembly pipeline.
 * Uses fast character-ratio heuristics (~10% accuracy) instead of tiktoken
 * to stay within the 200ms assembly budget.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { TokenAllocation } from '@/lib/conversation/types'
import { logger } from '@/lib/core/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN_TEXT = 3.5
const CHARS_PER_TOKEN_JSON = 3.0
const MESSAGE_OVERHEAD_TOKENS = 4 // role + formatting overhead per message

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TierInput {
  name: keyof Omit<TokenAllocation, 'total' | 'budget' | 'overBudget'>
  content: string
  priority: number // lower = higher priority
  minTokens: number
  maxTokens: number
  compressible: boolean
}

export type TrimStrategy = 'truncate_end' | 'reduce_sections' | 'reduce_items'

// ─── TokenBudgetManager ─────────────────────────────────────────────────────

export class TokenBudgetManager {
  private budget: number

  constructor(budget: number = 8000) {
    this.budget = budget
  }

  /**
   * Estimate tokens for a string using character-ratio heuristic.
   * ~10% accuracy is acceptable for budget management (not billing).
   */
  estimateTokens(text: string, type: 'text' | 'json' = 'text'): number {
    if (!text) return 0
    const ratio = type === 'json' ? CHARS_PER_TOKEN_JSON : CHARS_PER_TOKEN_TEXT
    return Math.ceil(text.length / ratio)
  }

  /**
   * Estimate tokens for an array of Anthropic MessageParam objects.
   * Accounts for ~4 tokens of overhead per message for role/formatting.
   */
  estimateMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS
      } else if (Array.isArray(msg.content)) {
        // Content blocks (tool_use, tool_result, text)
        for (const block of msg.content) {
          if ('text' in block && typeof block.text === 'string') {
            total += this.estimateTokens(block.text)
          } else {
            total += this.estimateTokens(JSON.stringify(block), 'json')
          }
        }
        total += MESSAGE_OVERHEAD_TOKENS
      }
    }
    return total
  }

  /**
   * Allocate budget across tiers with priority ordering.
   *
   * Algorithm:
   * 1. Allocate non-negotiable minimums for each tier
   * 2. Fill remaining budget by priority until exhausted
   * 3. If over budget, trim compressible tiers from lowest priority upward
   */
  allocate(tiers: TierInput[]): TokenAllocation {
    const sorted = [...tiers].sort((a, b) => a.priority - b.priority)

    const allocations = new Map<string, number>()
    let remaining = this.budget

    // Phase 1: Allocate minimums
    for (const tier of sorted) {
      const actual = this.estimateTokens(tier.content)
      const min = Math.min(tier.minTokens, actual)
      allocations.set(tier.name, min)
      remaining -= min
    }

    // Phase 2: Fill up to actual need by priority
    for (const tier of sorted) {
      const actual = this.estimateTokens(tier.content)
      const current = allocations.get(tier.name) ?? 0
      const wanted = Math.min(actual, tier.maxTokens) - current

      if (wanted > 0 && remaining > 0) {
        const grant = Math.min(wanted, remaining)
        allocations.set(tier.name, current + grant)
        remaining -= grant
      }
    }

    // Phase 3: If over budget, trim compressible tiers from lowest priority
    if (remaining < 0) {
      const reverseSorted = [...sorted].reverse()
      for (const tier of reverseSorted) {
        if (!tier.compressible || remaining >= 0) continue
        const current = allocations.get(tier.name) ?? 0
        const canTrim = current - tier.minTokens
        if (canTrim > 0) {
          const trim = Math.min(canTrim, Math.abs(remaining))
          allocations.set(tier.name, current - trim)
          remaining += trim
        }
      }
    }

    const result: TokenAllocation = {
      systemPrompt: allocations.get('systemPrompt') ?? 0,
      entityContext: allocations.get('entityContext') ?? 0,
      recentTurns: allocations.get('recentTurns') ?? 0,
      compressedHistory: allocations.get('compressedHistory') ?? 0,
      keyFacts: allocations.get('keyFacts') ?? 0,
      pendingActions: allocations.get('pendingActions') ?? 0,
      total: 0,
      budget: this.budget,
      overBudget: false,
    }

    result.total =
      result.systemPrompt +
      result.entityContext +
      result.recentTurns +
      result.compressedHistory +
      result.keyFacts +
      result.pendingActions
    result.overBudget = result.total > this.budget

    if (result.overBudget) {
      logger.warn('[token-budget] Over budget after allocation', {
        total: result.total,
        budget: this.budget,
        overage: result.total - this.budget,
      })
    }

    return result
  }

  /**
   * Trim content to fit within a token budget.
   *
   * Strategies:
   * - truncate_end: Hard cut at max chars (default, for any content)
   * - reduce_sections: Remove ## sections from the bottom (for system prompts)
   * - reduce_items: Remove list items from the bottom (for bullet lists)
   */
  trimToFit(content: string, maxTokens: number, strategy: TrimStrategy = 'truncate_end'): string {
    if (this.estimateTokens(content) <= maxTokens) return content

    if (strategy === 'reduce_sections') {
      const sections = content.split(/\n##\s/)
      while (sections.length > 1) {
        sections.pop()
        const trimmed = sections.join('\n## ')
        if (this.estimateTokens(trimmed) <= maxTokens) return trimmed
      }
    }

    if (strategy === 'reduce_items') {
      const lines = content.split('\n')
      while (lines.length > 1) {
        const last = lines[lines.length - 1]
        if (/^\s*[-\d]/.test(last)) {
          lines.pop()
          const trimmed = lines.join('\n')
          if (this.estimateTokens(trimmed) <= maxTokens) return trimmed
        } else {
          break
        }
      }
    }

    // Fallback: hard truncation
    const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN_TEXT)
    return content.slice(0, maxChars) + '...'
  }

  /** Get the configured budget */
  getBudget(): number {
    return this.budget
  }
}

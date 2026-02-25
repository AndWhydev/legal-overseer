import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { scorePriority } from '@/lib/agent/channel-triage'
import { routeMessage } from '@/lib/agent/action-router'
import type { ClassificationResult } from '@/lib/agent/classifier'

afterEach(() => vi.restoreAllMocks())

/**
 * Integration test: Message ingestion -> classification -> routing -> agent dispatch.
 * Tests the pipeline deterministic stages (classification parsing, routing, priority scoring)
 * without requiring LLM calls.
 */

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    significance: 5,
    timeSensitivity: 'today',
    resolves: [],
    unblocks: [],
    recommendedActions: [],
    reasoning: 'test classification',
    category: 'client',
    ...overrides,
  }
}

describe('Channel Pipeline Integration', () => {
  describe('classification -> priority scoring -> routing', () => {
    it('high-priority lead gets routed to lead-swarm immediately', () => {
      const classification = makeClassification({
        significance: 9,
        timeSensitivity: 'immediate',
        category: 'lead',
        recommendedActions: ['create_task', 'forward_to_lead_swarm'],
      })

      const priority = scorePriority(classification)
      expect(priority).toBe('critical')

      const route = routeMessage(classification)
      expect(route.decision).toBe('immediate')
      expect(route.targetAgent).toBe('lead-swarm')
    })

    it('medium-priority client message gets batched', () => {
      const classification = makeClassification({
        significance: 5,
        timeSensitivity: 'this_week',
        category: 'client',
      })

      const priority = scorePriority(classification)
      expect(priority).toBe('medium')

      const route = routeMessage(classification)
      expect(route.decision).toBe('batch')
      expect(route.batchWindow).toBe(30)
    })

    it('spam gets skipped with low priority', () => {
      const classification = makeClassification({
        significance: 1,
        timeSensitivity: 'none',
        category: 'spam',
      })

      const priority = scorePriority(classification)
      expect(priority).toBe('low')

      const route = routeMessage(classification)
      expect(route.decision).toBe('skip')
    })

    it('urgent client with invoice actions routes to invoice-flow', () => {
      const classification = makeClassification({
        significance: 8,
        timeSensitivity: 'immediate',
        category: 'client',
        recommendedActions: ['create_invoice', 'reply'],
      })

      const route = routeMessage(classification)
      expect(route.decision).toBe('immediate')
      expect(route.targetAgent).toBe('invoice-flow')
    })

    it('error alert routes to sentry', () => {
      const classification = makeClassification({
        significance: 8,
        timeSensitivity: 'immediate',
        category: 'notification',
        recommendedActions: ['check_error_logs', 'alert_team'],
      })

      const route = routeMessage(classification)
      expect(route.targetAgent).toBe('sentry')
    })

    it('low significance messages are skipped regardless of category', () => {
      const classification = makeClassification({
        significance: 2,
        timeSensitivity: 'today',
        category: 'client',
      })

      const route = routeMessage(classification)
      expect(route.decision).toBe('skip')
    })

    it('priority boosts from contact metadata affect scoring', () => {
      const classification = makeClassification({
        significance: 5,
        timeSensitivity: 'today',
        category: 'client',
      })

      const basePriority = scorePriority(classification)
      const boostedPriority = scorePriority(classification, {
        isClient: true,
        hasOutstanding: true,
        overdueCount: 2,
        upcomingDeadlines: 1,
      })

      // Base: 5 + 1(today) = 6 => medium (actually 6 is medium since < 7)
      // Boosted: 5 + 1(today) + 1(client) + 1(outstanding) + 1(overdue) + 1(deadline) = 10 => critical
      const levels = ['low', 'medium', 'high', 'critical']
      expect(levels.indexOf(boostedPriority)).toBeGreaterThan(levels.indexOf(basePriority))
    })

    it('newsletter message gets low urgency batch or skip', () => {
      const classification = makeClassification({
        significance: 2,
        timeSensitivity: 'none',
        category: 'newsletter',
      })

      const route = routeMessage(classification)
      expect(route.decision).toBe('skip')
    })
  })
})

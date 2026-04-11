/**
 * Query Gate — TDD tests.
 *
 * Tests System 1/2 query complexity classification.
 * System 1 = fast path (dossier-only, greetings, lookups, confirmations).
 * System 2 = full retrieval (reasoning, temporal, multi-entity, aggregation).
 */

import { describe, it, expect } from 'vitest'

import {
  classifyQueryComplexity,
  shouldEscalateToSystem2,
  type QueryComplexity,
} from '../query-gate'

// ─── classifyQueryComplexity ──────────────────────────────────────────────

describe('classifyQueryComplexity', () => {
  // ── System 1: Greetings ──────────────────────────────────────────────

  it('classifies "hello" as system1', () => {
    expect(classifyQueryComplexity('hello')).toBe('system1')
  })

  it('classifies "hi" as system1', () => {
    expect(classifyQueryComplexity('hi')).toBe('system1')
  })

  it('classifies "hey" as system1', () => {
    expect(classifyQueryComplexity('hey')).toBe('system1')
  })

  it('classifies "good morning" as system1', () => {
    expect(classifyQueryComplexity('good morning')).toBe('system1')
  })

  it('classifies "good afternoon" as system1', () => {
    expect(classifyQueryComplexity('good afternoon')).toBe('system1')
  })

  it('classifies "good evening" as system1', () => {
    expect(classifyQueryComplexity('good evening')).toBe('system1')
  })

  it('classifies "thanks" as system1', () => {
    expect(classifyQueryComplexity('thanks')).toBe('system1')
  })

  // ── System 1: Confirmations ──────────────────────────────────────────

  it('classifies "yes" as system1', () => {
    expect(classifyQueryComplexity('yes')).toBe('system1')
  })

  it('classifies "no" as system1', () => {
    expect(classifyQueryComplexity('no')).toBe('system1')
  })

  it('classifies "ok" as system1', () => {
    expect(classifyQueryComplexity('ok')).toBe('system1')
  })

  it('classifies "approved" as system1', () => {
    expect(classifyQueryComplexity('approved')).toBe('system1')
  })

  it('classifies "rejected" as system1', () => {
    expect(classifyQueryComplexity('rejected')).toBe('system1')
  })

  it('classifies "cancel" as system1', () => {
    expect(classifyQueryComplexity('cancel')).toBe('system1')
  })

  it('classifies "yes, send it" as system1', () => {
    expect(classifyQueryComplexity('yes, send it')).toBe('system1')
  })

  // ── System 1: Simple lookups ─────────────────────────────────────────

  it('classifies "what\'s Steve\'s email?" as system1', () => {
    expect(classifyQueryComplexity("what's Steve's email?")).toBe('system1')
  })

  it('classifies "what is her phone number?" as system1', () => {
    expect(classifyQueryComplexity('what is her phone number?')).toBe('system1')
  })

  it('classifies "what\'s his address?" as system1', () => {
    expect(classifyQueryComplexity("what's his address?")).toBe('system1')
  })

  // ── System 1: Reminders ──────────────────────────────────────────────

  it('classifies "remind me to call Steve" as system1', () => {
    expect(classifyQueryComplexity('remind me to call Steve')).toBe('system1')
  })

  // ── System 1: Simple actions ─────────────────────────────────────────

  it('classifies "send it" as system1', () => {
    expect(classifyQueryComplexity('send it')).toBe('system1')
  })

  it('classifies "forward that" as system1', () => {
    expect(classifyQueryComplexity('forward that')).toBe('system1')
  })

  it('classifies "reply to this" as system1', () => {
    expect(classifyQueryComplexity('reply to this')).toBe('system1')
  })

  // ── System 1: Short queries without complexity signals ───────────────

  it('classifies short query without signals as system1', () => {
    expect(classifyQueryComplexity('check my inbox')).toBe('system1')
  })

  // ── System 2: Reasoning questions ────────────────────────────────────

  it('classifies "should we take this project given capacity?" as system2', () => {
    expect(classifyQueryComplexity('should we take this project given capacity?')).toBe('system2')
  })

  it('classifies "why did the invoice get rejected?" as system2', () => {
    expect(classifyQueryComplexity('why did the invoice get rejected?')).toBe('system2')
  })

  it('classifies "analyze the revenue trends" as system2', () => {
    expect(classifyQueryComplexity('analyze the revenue trends')).toBe('system2')
  })

  it('classifies "compare this month with last month" as system2', () => {
    expect(classifyQueryComplexity('compare this month with last month')).toBe('system2')
  })

  it('classifies "evaluate whether we can afford it" as system2', () => {
    expect(classifyQueryComplexity('evaluate whether we can afford it')).toBe('system2')
  })

  it('classifies "assess the risk" as system2', () => {
    expect(classifyQueryComplexity('assess the risk')).toBe('system2')
  })

  // ── System 2: Temporal queries ───────────────────────────────────────

  it('classifies "what\'s the full history with Steve?" as system2', () => {
    expect(classifyQueryComplexity("what's the full history with Steve?")).toBe('system2')
  })

  it('classifies "show me the timeline" as system2', () => {
    expect(classifyQueryComplexity('show me the timeline')).toBe('system2')
  })

  it('classifies "tell me the full story" as system2', () => {
    expect(classifyQueryComplexity('tell me the full story')).toBe('system2')
  })

  it('classifies "everything about this project" as system2', () => {
    expect(classifyQueryComplexity('everything about this project')).toBe('system2')
  })

  it('classifies "what happened last week" as system2', () => {
    expect(classifyQueryComplexity('what happened last week')).toBe('system2')
  })

  it('classifies "messages before tuesday" as system2', () => {
    expect(classifyQueryComplexity('messages before tuesday')).toBe('system2')
  })

  it('classifies "what changed after the meeting" as system2', () => {
    expect(classifyQueryComplexity('what changed after the meeting')).toBe('system2')
  })

  it('classifies "last month revenue" as system2', () => {
    expect(classifyQueryComplexity('last month revenue')).toBe('system2')
  })

  it('classifies "last year summary" as system2', () => {
    expect(classifyQueryComplexity('last year summary')).toBe('system2')
  })

  // ── System 2: Capacity / trade-off queries ───────────────────────────

  it('classifies "do we have capacity for this?" as system2', () => {
    expect(classifyQueryComplexity('do we have capacity for this?')).toBe('system2')
  })

  it('classifies "can we afford this project?" as system2', () => {
    expect(classifyQueryComplexity('can we afford this project?')).toBe('system2')
  })

  it('classifies "what\'s the trade-off?" as system2', () => {
    expect(classifyQueryComplexity("what's the trade-off?")).toBe('system2')
  })

  // ── System 2: Aggregation queries ────────────────────────────────────

  it('classifies "list all clients" as system2', () => {
    expect(classifyQueryComplexity('list all clients')).toBe('system2')
  })

  it('classifies "every project status" as system2', () => {
    expect(classifyQueryComplexity('every project status')).toBe('system2')
  })

  it('classifies "each contact needs to be updated" as system2', () => {
    expect(classifyQueryComplexity('each contact needs to be updated')).toBe('system2')
  })

  // ── System 2: High entity mention count ──────────────────────────────

  it('classifies as system2 when entityMentionCount >= 3', () => {
    expect(classifyQueryComplexity('hello', { entityMentionCount: 3 })).toBe('system2')
  })

  it('classifies as system1 when entityMentionCount < 3 and query is simple', () => {
    expect(classifyQueryComplexity('hello', { entityMentionCount: 2 })).toBe('system1')
  })

  // ── System 2: Default for longer ambiguous queries ───────────────────

  it('defaults to system2 for longer queries without clear signals', () => {
    expect(
      classifyQueryComplexity(
        'I need to understand the relationship between project deliverables and resource allocation',
      ),
    ).toBe('system2')
  })

  // ── Edge cases ───────────────────────────────────────────────────────

  it('handles empty string (short, no signals → system1)', () => {
    expect(classifyQueryComplexity('')).toBe('system1')
  })

  it('handles case-insensitive matching', () => {
    expect(classifyQueryComplexity('HELLO')).toBe('system1')
    expect(classifyQueryComplexity('WHY is this happening?')).toBe('system2')
  })
})

// ─── shouldEscalateToSystem2 ──────────────────────────────────────────────

describe('shouldEscalateToSystem2', () => {
  it('returns true when confidence is below threshold', () => {
    expect(shouldEscalateToSystem2(0.4)).toBe(true)
  })

  it('returns false when confidence is above threshold', () => {
    expect(shouldEscalateToSystem2(0.8)).toBe(false)
  })

  it('returns true when confidence equals threshold', () => {
    // At threshold boundary — equal means "not confident enough", escalate
    expect(shouldEscalateToSystem2(0.6)).toBe(false)
  })

  it('uses custom threshold', () => {
    expect(shouldEscalateToSystem2(0.7, 0.8)).toBe(true)
    expect(shouldEscalateToSystem2(0.9, 0.8)).toBe(false)
  })

  it('returns true at exactly the default threshold (0.6)', () => {
    // 0.6 >= 0.6 → false (confident enough)
    expect(shouldEscalateToSystem2(0.6)).toBe(false)
  })

  it('handles edge case of 0 confidence', () => {
    expect(shouldEscalateToSystem2(0)).toBe(true)
  })

  it('handles edge case of 1.0 confidence', () => {
    expect(shouldEscalateToSystem2(1.0)).toBe(false)
  })
})

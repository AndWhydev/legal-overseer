/**
 * Role Mapping Safety Tests — guards the direction→role contract for the
 * LLM history builder.
 *
 * BACKGROUND (Phase 51 / A3):
 *   On iMessage (Sendblue), a regression caused the agent to replay strings
 *   that Tor had *typed at it* as if they were fresh inbound user turns.
 *   Root cause analysis showed two possible failure modes:
 *     1. Sendblue echoes slipping past the webhook echo filter (so an
 *        outbound message gets stored as channel_messages.direction='inbound').
 *     2. A bug in `messagesToHistory` that incorrectly mapped an 'assistant'
 *        role to LLM role='user'.
 *
 * This file pins the mapping invariant so regressions can't happen silently:
 *
 *   conversation_messages.role='user'      → Anthropic role='user'
 *   conversation_messages.role='assistant' → Anthropic role='assistant'
 *   everything else (tool_call, tool_result, system, null, unknown) → SKIPPED
 *
 * The "skip unknown" behavior is deliberate. If a schema change adds a new
 * role, the worst case is a truncated history — never a role inversion where
 * the agent sees its own prior output as a fresh user turn.
 */

import { describe, expect, it } from 'vitest'
import { messagesToHistory } from './unified-pipeline'
import type { ConversationMessageRecord, MessageRole } from './types'

// Minimal factory: fill only what messagesToHistory touches.
function makeMsg(
  overrides: Partial<ConversationMessageRecord> & { role: MessageRole; content: string },
): ConversationMessageRecord {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2, 9)}`,
    thread_id: 'thread-test',
    user_id: 'user-test',
    org_id: 'org-test',
    turn_number: overrides.turn_number ?? 1,
    role: overrides.role,
    channel: overrides.channel ?? 'sendblue',
    content: overrides.content,
    tool_data: null,
    channel_metadata: null,
    token_count: null,
    metadata: {},
    created_at: overrides.created_at ?? '2026-04-17T00:00:00.000Z',
  }
}

describe('messagesToHistory — direction→role contract', () => {
  it('maps role=user → LLM user', () => {
    const history = messagesToHistory([
      makeMsg({ role: 'user', content: 'hey bit' }),
    ])
    expect(history).toEqual([{ role: 'user', content: 'hey bit' }])
  })

  it('maps role=assistant → LLM assistant', () => {
    const history = messagesToHistory([
      makeMsg({ role: 'assistant', content: 'hey tor' }),
    ])
    expect(history).toEqual([{ role: 'assistant', content: 'hey tor' }])
  })

  it('preserves turn order across a realistic inbound/outbound thread', () => {
    const thread: ConversationMessageRecord[] = [
      makeMsg({ role: 'user', content: 'u1', turn_number: 1 }),
      makeMsg({ role: 'assistant', content: 'a1', turn_number: 2 }),
      makeMsg({ role: 'user', content: 'u2', turn_number: 3 }),
      makeMsg({ role: 'assistant', content: 'a2', turn_number: 4 }),
    ]
    const history = messagesToHistory(thread)
    expect(history).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a2' },
    ])
  })

  it('skips tool_call and tool_result rows (engine replays tool state internally)', () => {
    const history = messagesToHistory([
      makeMsg({ role: 'user', content: 'search my gmail' }),
      makeMsg({ role: 'tool_call' as MessageRole, content: 'search_gmail({...})' }),
      makeMsg({ role: 'tool_result' as MessageRole, content: '{"results":[]}' }),
      makeMsg({ role: 'assistant', content: 'no results' }),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'search my gmail' },
      { role: 'assistant', content: 'no results' },
    ])
  })

  it('skips system rows (never injected as a turn)', () => {
    const history = messagesToHistory([
      makeMsg({ role: 'system' as MessageRole, content: 'you are a helpful assistant' }),
      makeMsg({ role: 'user', content: 'hi' }),
    ])
    expect(history).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('skips rows with unknown/null/empty role rather than guessing a mapping', () => {
    const weirdRows = [
      makeMsg({ role: 'user', content: 'legit inbound' }),
      makeMsg({ role: null as unknown as MessageRole, content: 'null role' }),
      makeMsg({ role: '' as unknown as MessageRole, content: 'empty role' }),
      makeMsg({ role: 'Contact' as unknown as MessageRole, content: 'capitalized stray role' }),
      makeMsg({ role: 'inbound' as unknown as MessageRole, content: 'accidentally stored direction, not role' }),
      makeMsg({ role: 'outbound' as unknown as MessageRole, content: 'accidentally stored direction, not role' }),
      makeMsg({ role: 'assistant', content: 'legit outbound' }),
    ]
    const history = messagesToHistory(weirdRows)
    expect(history).toEqual([
      { role: 'user', content: 'legit inbound' },
      { role: 'assistant', content: 'legit outbound' },
    ])
  })

  it('returns empty for an empty thread', () => {
    expect(messagesToHistory([])).toEqual([])
  })

  it('returns empty when the thread contains only non-replayable rows', () => {
    const history = messagesToHistory([
      makeMsg({ role: 'tool_call' as MessageRole, content: 't1' }),
      makeMsg({ role: 'tool_result' as MessageRole, content: 't2' }),
      makeMsg({ role: 'system' as MessageRole, content: 't3' }),
    ])
    expect(history).toEqual([])
  })

  // ── The CRITICAL invariant ─────────────────────────────────────────────
  // This is the test Phase 51 / A3 actually exists to pin.

  it('INVARIANT: no row with role=assistant can appear in LLM history as role=user', () => {
    // Simulate the exact bug we want to prevent: an outbound (assistant) row
    // accidentally being mapped to LLM role='user' — which is what would
    // cause the agent to "replay Tor's words back at him" if an outbound
    // turn somehow got classified inbound downstream.
    //
    // If a future refactor breaks the mapping (e.g. someone naively does
    // `role: msg.role === 'assistant' ? 'assistant' : 'user'` as a fallback),
    // this assertion catches it.
    const thread: ConversationMessageRecord[] = []
    const outboundContents: string[] = []

    // Fuzz: 50 interleaved turns with distinctive outbound strings
    for (let i = 0; i < 50; i++) {
      const role: MessageRole = i % 2 === 0 ? 'user' : 'assistant'
      const content =
        role === 'assistant'
          ? `AGENT_OUTBOUND_MARKER_${i}_should_never_appear_as_user`
          : `user inbound ${i}`
      if (role === 'assistant') outboundContents.push(content)
      thread.push(makeMsg({ role, content, turn_number: i }))
    }

    const history = messagesToHistory(thread)

    for (const turn of history) {
      if (turn.role === 'user') {
        const text = typeof turn.content === 'string'
          ? turn.content
          : JSON.stringify(turn.content)
        expect(text).not.toMatch(/AGENT_OUTBOUND_MARKER/)
      }
    }

    // And conversely: every outbound marker must appear on the assistant side.
    const assistantTexts = history
      .filter(t => t.role === 'assistant')
      .map(t => (typeof t.content === 'string' ? t.content : JSON.stringify(t.content)))
      .join('\n')
    for (const marker of outboundContents) {
      expect(assistantTexts).toContain(marker)
    }
  })

  it('INVARIANT: a malformed row where role value equals a direction string is DROPPED, not coerced', () => {
    // If something upstream accidentally writes `direction` into `role`
    // (e.g. `role: msg.direction` in a future migration), the output must
    // be empty — not silently re-interpreted as a user turn. This is the
    // "fail-closed" behavior that prevents iMessage echoes from being
    // replayed as fresh inbound user messages in the LLM prompt.
    const malformed = [
      makeMsg({ role: 'inbound' as unknown as MessageRole, content: 'echo from tor' }),
      makeMsg({ role: 'outbound' as unknown as MessageRole, content: 'prior agent reply' }),
    ]
    const history = messagesToHistory(malformed)
    expect(history).toEqual([])
  })
})

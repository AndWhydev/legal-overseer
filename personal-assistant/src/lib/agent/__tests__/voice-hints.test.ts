import { describe, it, expect } from 'vitest'
import { inferVoiceHint } from '../ai-sdk-bridge'

describe('inferVoiceHint', () => {
  it('detects short confirmations (<50 chars, no markdown)', () => {
    const hint = inferVoiceHint('Done!')
    expect(hint).toEqual({
      shouldSpeak: true,
      reason: 'short_confirmation',
    })
  })

  it('detects short confirmations with simple text', () => {
    const hint = inferVoiceHint("Got it, I'll take care of that.")
    expect(hint).toEqual({
      shouldSpeak: true,
      reason: 'short_confirmation',
    })
  })

  it('detects data tables and marks them as not speakable', () => {
    const tableResponse = `Here are the results:

| Name | Amount |
|------|--------|
| Alice | $100 |
| Bob | $200 |`
    const hint = inferVoiceHint(tableResponse)
    expect(hint).toEqual({
      shouldSpeak: false,
      reason: 'data_table',
    })
  })

  it('detects code blocks and marks them as not speakable', () => {
    const codeResponse = `Here's how to do it:

\`\`\`typescript
const x = 42
console.log(x)
\`\`\``
    const hint = inferVoiceHint(codeResponse)
    expect(hint).toEqual({
      shouldSpeak: false,
      reason: 'code_block',
    })
  })

  it('summarizes long responses (>500 chars) with first two sentences', () => {
    const longText =
      'This is the first sentence. This is the second sentence. ' +
      'A'.repeat(500)
    const hint = inferVoiceHint(longText)
    expect(hint.shouldSpeak).toBe(true)
    expect(hint.reason).toBe('long_response_summarized')
    expect(hint.summary).toBe(
      'This is the first sentence. This is the second sentence.'
    )
  })

  it('handles long response with single sentence as summary', () => {
    const longText = 'This is one very long sentence that goes on. ' + 'B'.repeat(500)
    const hint = inferVoiceHint(longText)
    expect(hint.shouldSpeak).toBe(true)
    expect(hint.reason).toBe('long_response_summarized')
    expect(hint.summary).toBe('This is one very long sentence that goes on.')
  })

  it('returns standard for medium-length text without special content', () => {
    const mediumText =
      'I checked your calendar and you have a meeting at 3pm with the design team. ' +
      'After that you have a free afternoon.'
    const hint = inferVoiceHint(mediumText)
    expect(hint).toEqual({
      shouldSpeak: true,
      reason: 'standard',
    })
  })

  it('prioritizes data_table over long_response_summarized', () => {
    const longTable = 'Here is a big table:\n' + '|---|'.padEnd(600, ' data |---|')
    const hint = inferVoiceHint(longTable)
    expect(hint.shouldSpeak).toBe(false)
    expect(hint.reason).toBe('data_table')
  })

  it('prioritizes code_block over long_response_summarized', () => {
    const longCode =
      'Here is a code example:\n```\n' + 'x = 1\n'.repeat(100) + '```'
    const hint = inferVoiceHint(longCode)
    expect(hint.shouldSpeak).toBe(false)
    expect(hint.reason).toBe('code_block')
  })
})

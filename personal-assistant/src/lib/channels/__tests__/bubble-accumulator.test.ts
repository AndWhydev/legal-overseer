import { describe, it, expect, vi } from 'vitest'
import { BubbleAccumulator, defaultInterBubbleDelayMs } from '../bubble-accumulator'

function makeKeepalive() {
  return { reassert: vi.fn() }
}

function makeOnBubble() {
  const bubbles: string[] = []
  const fn = vi.fn(async (b: string) => {
    bubbles.push(b)
  })
  return { fn, bubbles }
}

/** No-op sleep so we don't wait real time in tests. */
const instantSleep = () => Promise.resolve()

describe('BubbleAccumulator', () => {
  it('short text with no paragraph break → one bubble on flushComplete', async () => {
    const { fn, bubbles } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: makeKeepalive(),
      sleep: instantSleep,
    })

    acc.push('hello there')
    // No drain yet.
    await Promise.resolve()
    expect(bubbles.length).toBe(0)

    await acc.flushComplete()
    expect(bubbles).toEqual(['hello there'])
  })

  it('long text with paragraph break → first bubble emits before second chunk', async () => {
    const { fn, bubbles } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: makeKeepalive(),
      sleep: instantSleep,
    })

    // First paragraph with enough non-ws to trigger drain (≥40 chars) + \n\n
    acc.push('This is the first paragraph and it is plenty long.\n\n')
    // Let the drain promise chain resolve.
    await new Promise(r => setTimeout(r, 0))
    // Await in-flight drains
    await (acc as unknown as { draining: Promise<void> }).draining
    expect(bubbles.length).toBe(1)
    expect(bubbles[0]).toBe('This is the first paragraph and it is plenty long.')

    acc.push('Second paragraph arrives later.')
    await acc.flushComplete()
    expect(bubbles.length).toBe(2)
    expect(bubbles[1]).toBe('Second paragraph arrives later.')
  })

  it('stream end without trailing \\n\\n flushes remainder', async () => {
    const { fn, bubbles } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: makeKeepalive(),
      sleep: instantSleep,
    })

    acc.push('First paragraph is here and it is definitely long enough to flush.\n\n')
    acc.push('Trailing partial without newlines')
    await acc.flushComplete()
    expect(bubbles.length).toBe(2)
    expect(bubbles[0]).toBe('First paragraph is here and it is definitely long enough to flush.')
    expect(bubbles[1]).toBe('Trailing partial without newlines')
  })

  it('6 paragraphs → 3 bubbles (cap preserved)', async () => {
    const { fn, bubbles } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: makeKeepalive(),
      sleep: instantSleep,
    })

    const six = ['one', 'two', 'three', 'four', 'five', 'six']
      .map(p => `${p} paragraph text that is plenty long to exceed the threshold here.`)
      .join('\n\n')
    acc.push(six)
    await acc.flushComplete()

    expect(bubbles.length).toBe(3)
  })

  it('stops shipping after bubble 3 even if more chunks arrive (collapses into bubble 3)', async () => {
    const { fn, bubbles } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: makeKeepalive(),
      sleep: instantSleep,
    })

    // Two paragraphs drain out as bubbles 1 and 2… actually only one will
    // drain (we reserve the last slot). Let's push 3 paragraphs incrementally.
    acc.push('paragraph one has plenty of text to clear the flush threshold.\n\n')
    acc.push('paragraph two has plenty of text to clear the flush threshold.\n\n')
    await (acc as unknown as { draining: Promise<void> }).draining

    // After pushing 2 paragraphs + \n\n separators, one should have drained.
    // We only ship up to maxBubbles - 1 = 2 before flushComplete.
    expect(bubbles.length).toBeGreaterThanOrEqual(1)
    expect(bubbles.length).toBeLessThanOrEqual(2)

    // Now push several more paragraphs — they should all collapse into bubble 3.
    acc.push('paragraph three lives here.\n\n')
    acc.push('paragraph four arrives late.\n\n')
    acc.push('paragraph five arrives even later.')
    await acc.flushComplete()

    // Final count is exactly 3. No bubble-4.
    expect(bubbles.length).toBe(3)
  })

  it('reasserts typing indicator before each bubble', async () => {
    const keepalive = makeKeepalive()
    const { fn } = makeOnBubble()
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: keepalive,
      sleep: instantSleep,
    })

    acc.push('first paragraph is long enough to clear the flush threshold.\n\n')
    acc.push('second paragraph.')
    await acc.flushComplete()

    // Called at least once per bubble.
    expect(keepalive.reassert.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('C3: inter-bubble delay = bubble.length * 35ms clamped to [400, 2500]', () => {
    expect(defaultInterBubbleDelayMs('')).toBe(400)
    expect(defaultInterBubbleDelayMs('x'.repeat(10))).toBe(400) // 350 → clamped up
    expect(defaultInterBubbleDelayMs('x'.repeat(30))).toBe(1050) // 30*35 = 1050
    expect(defaultInterBubbleDelayMs('x'.repeat(100))).toBe(2500) // 3500 → clamped down
  })

  it('C3: waits between bubbles using interBubbleDelayMs', async () => {
    const keepalive = makeKeepalive()
    const { fn } = makeOnBubble()
    const delays: number[] = []
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms)
    })
    const acc = new BubbleAccumulator({
      channel: 'sendblue',
      onBubble: fn,
      typingKeepalive: keepalive,
      sleep,
    })

    // Push three complete paragraphs at once — triggers sleep between shipments.
    const text = [
      'paragraph one has enough text to clear the flush threshold easily.',
      'paragraph two has enough text to clear the flush threshold easily.',
      'paragraph three has enough text to clear the flush threshold easily.',
    ].join('\n\n')
    acc.push(text)
    await acc.flushComplete()

    // Between bubbles we should have slept; values in [400, 2500].
    expect(delays.length).toBeGreaterThanOrEqual(1)
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(400)
      expect(d).toBeLessThanOrEqual(2500)
    }
  })
})

import type { Channel } from '@/lib/conversation/types'
import { renderForChannel } from './renderers'
import { splitIntoBubbles } from './gateway-handler'

/**
 * Natural inter-bubble delay (C3). 35ms per char, clamped to [400ms, 2500ms].
 * Typing indicator should stay asserted during this delay.
 */
export function defaultInterBubbleDelayMs(bubble: string): number {
  const raw = bubble.length * 35
  return Math.max(400, Math.min(2500, raw))
}

/** Minimal surface we need from TypingKeepalive — keeps the module testable. */
interface KeepaliveHandle {
  reassert(): void
}

export interface BubbleAccumulatorOptions {
  channel: Channel
  onBubble: (bubble: string) => Promise<void>
  typingKeepalive: KeepaliveHandle
  interBubbleDelayMs?: (bubble: string) => number
  /** Override the delay scheduler — tests inject a sync resolver. */
  sleep?: (ms: number) => Promise<void>
  /** Hard bubble cap (preserves gateway-handler.ts MAX_BUBBLES). */
  maxBubbles?: number
}

const DEFAULT_MAX_BUBBLES = 3
const FLUSH_MIN_CHARS = 40

function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * BubbleAccumulator — buffer model-produced text and drain it out as iMessage
 * bubbles on natural paragraph boundaries, pacing sends with inter-bubble
 * delays and keeping the typing indicator warm between bubbles.
 *
 * Flush rule (drain()): when the buffer contains `\n\n` and ≥40 non-whitespace
 * chars, all complete paragraphs are rendered → split → sent, and the trailing
 * partial paragraph stays buffered.
 *
 * Once MAX_BUBBLES have shipped, further pushes collapse into the final
 * bubble on flushComplete() (preserving the hard cap set by splitIntoBubbles).
 */
export class BubbleAccumulator {
  private readonly channel: Channel
  private readonly onBubble: (bubble: string) => Promise<void>
  private readonly typing: KeepaliveHandle
  private readonly interBubbleDelayMs: (bubble: string) => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly maxBubbles: number

  private buffer = ''
  private sentCount = 0
  private draining: Promise<void> = Promise.resolve()

  constructor(opts: BubbleAccumulatorOptions) {
    this.channel = opts.channel
    this.onBubble = opts.onBubble
    this.typing = opts.typingKeepalive
    this.interBubbleDelayMs = opts.interBubbleDelayMs ?? defaultInterBubbleDelayMs
    this.sleep = opts.sleep ?? defaultSleep
    this.maxBubbles = opts.maxBubbles ?? DEFAULT_MAX_BUBBLES
  }

  /** Append a text chunk to the buffer and opportunistically drain. */
  push(chunk: string): void {
    if (!chunk) return
    this.buffer += chunk
    if (this.shouldDrain()) {
      // Chain drains so we never interleave two bubble flushes.
      this.draining = this.draining.then(() => this.drain())
    }
  }

  /** Flush remaining buffered text and await all in-flight drains. */
  async flushComplete(): Promise<void> {
    await this.draining
    if (this.buffer.trim().length === 0) return
    await this.drainAll()
  }

  private shouldDrain(): boolean {
    // Once we've shipped maxBubbles - 1, we stop draining and let buffer
    // accumulate — the final bubble collapses everything remaining on
    // flushComplete().
    if (this.sentCount >= this.maxBubbles - 1) return false
    if (!this.buffer.includes('\n\n')) return false
    const nonWs = this.buffer.replace(/\s+/g, '').length
    return nonWs >= FLUSH_MIN_CHARS
  }

  /**
   * Drain complete paragraphs, leave the trailing partial in the buffer.
   * Only ships up to (maxBubbles - 1) bubbles — the final slot is reserved
   * for flushComplete() so late chunks collapse into it.
   */
  private async drain(): Promise<void> {
    if (this.sentCount >= this.maxBubbles - 1) return

    const lastSep = this.buffer.lastIndexOf('\n\n')
    if (lastSep === -1) return

    const complete = this.buffer.slice(0, lastSep)
    const tail = this.buffer.slice(lastSep + 2)

    if (complete.trim().length === 0) return

    this.buffer = tail
    const remainingSlots = this.maxBubbles - 1 - this.sentCount
    await this.shipText(complete, remainingSlots)
  }

  /** Ship whatever is in the buffer right now (used by flushComplete). */
  private async drainAll(): Promise<void> {
    const text = this.buffer
    this.buffer = ''
    if (text.trim().length === 0) return
    const remainingSlots = this.maxBubbles - this.sentCount
    if (remainingSlots <= 0) return
    await this.shipText(text, remainingSlots)
  }

  /**
   * Render text → bubbles and ship up to `maxShipments` of them. If there
   * are more bubbles than slots, collapse the tail into the last one.
   */
  private async shipText(text: string, maxShipments: number): Promise<void> {
    if (maxShipments <= 0) return
    const rendered = renderForChannel(text, this.channel)
    let bubbles = splitIntoBubbles(rendered)
    if (bubbles.length === 0) return

    if (bubbles.length > maxShipments) {
      const kept = bubbles.slice(0, maxShipments - 1)
      const tail = bubbles.slice(maxShipments - 1).join('\n\n')
      bubbles = [...kept, tail]
    }

    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i]
      const isLast = i === bubbles.length - 1
      await this.shipBubble(bubble)
      if (!isLast) {
        await this.sleep(this.interBubbleDelayMs(bubble))
        this.typing.reassert()
      }
    }
  }

  private async shipBubble(bubble: string): Promise<void> {
    this.typing.reassert()
    await this.onBubble(bubble)
    this.sentCount += 1
  }
}

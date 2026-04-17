/**
 * Typing indicator keep-alive loop.
 *
 * Sendblue's typing indicator expires in ~3s, so firing it once is not enough
 * when the model takes 5-15s to produce its first bubble. This loop fires on
 * a schedule — first at `firstFireDelayMs` after start, then every
 * `intervalMs` — until either `stop()` is called or the `safetyCapMs` is hit.
 *
 * Between bubbles, callers should call `reassert()` to re-fire the indicator
 * immediately so the "..." stays visible while the next bubble renders.
 */
export interface TypingKeepaliveOptions {
  /** Fires the indicator. Must be idempotent / safe to call repeatedly. */
  send: () => Promise<void>
  /** Delay before the first fire. Default 900ms. */
  firstFireDelayMs?: number
  /** Interval between subsequent fires. Default 2500ms. */
  intervalMs?: number
  /** Hard cap on total runtime. Default 30_000ms. */
  safetyCapMs?: number
}

export class TypingKeepalive {
  private readonly send: () => Promise<void>
  private readonly firstFireDelayMs: number
  private readonly intervalMs: number
  private readonly safetyCapMs: number

  private firstTimer: ReturnType<typeof setTimeout> | null = null
  private intervalTimer: ReturnType<typeof setInterval> | null = null
  private safetyTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(opts: TypingKeepaliveOptions) {
    this.send = opts.send
    this.firstFireDelayMs = opts.firstFireDelayMs ?? 900
    this.intervalMs = opts.intervalMs ?? 2500
    this.safetyCapMs = opts.safetyCapMs ?? 30_000
  }

  /**
   * Begin the keep-alive loop. First fire happens after firstFireDelayMs.
   * No-op if already stopped or started.
   */
  start(): void {
    if (this.stopped || this.firstTimer || this.intervalTimer) return

    this.firstTimer = setTimeout(() => {
      this.firstTimer = null
      if (this.stopped) return
      void this.fire()
      this.intervalTimer = setInterval(() => {
        if (this.stopped) return
        void this.fire()
      }, this.intervalMs)
    }, this.firstFireDelayMs)

    this.safetyTimer = setTimeout(() => {
      this.stop()
    }, this.safetyCapMs)
  }

  /** Stop the loop. Safe to call multiple times. */
  stop(): void {
    this.stopped = true
    if (this.firstTimer) {
      clearTimeout(this.firstTimer)
      this.firstTimer = null
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer)
      this.safetyTimer = null
    }
  }

  /**
   * Fire the indicator immediately (e.g. between bubbles). Does not reset
   * the interval schedule — the next scheduled fire still happens on time.
   * No-op if already stopped.
   */
  reassert(): void {
    if (this.stopped) return
    void this.fire()
  }

  private async fire(): Promise<void> {
    try {
      await this.send()
    } catch {
      // Silent — typing indicator failures are non-fatal by design.
    }
  }
}

/**
 * No-op keep-alive used by channels that don't support typing indicators
 * (WhatsApp, Telegram, etc). Lets callers use a uniform API.
 */
export const NOOP_TYPING_KEEPALIVE: Pick<TypingKeepalive, 'start' | 'stop' | 'reassert'> = {
  start() {},
  stop() {},
  reassert() {},
}

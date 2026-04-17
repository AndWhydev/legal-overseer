import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TypingKeepalive } from '../typing-keepalive'

describe('TypingKeepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function flushMicrotasks() {
    // Let queued promise callbacks (void this.fire()) settle.
    await Promise.resolve()
    await Promise.resolve()
  }

  it('fires once at T+900ms', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()

    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(899)
    expect(send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)

    k.stop()
  })

  it('re-fires every 2.5s after the first fire', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()

    vi.advanceTimersByTime(900)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2500)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(2500)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(3)

    k.stop()
  })

  it('stops firing when stop() is called', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()

    vi.advanceTimersByTime(900)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)

    k.stop()

    vi.advanceTimersByTime(10_000)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stops firing at the 30s safety cap', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()

    // Advance to 30s: first fire at 900ms, then every 2500ms thereafter.
    // Expected fires: t=900, 3400, 5900, 8400, 10900, 13400, 15900, 18400, 20900, 23400, 25900, 28400
    // That's 12 fires before 30s cap.
    vi.advanceTimersByTime(30_000)
    await flushMicrotasks()
    const countAt30s = send.mock.calls.length
    expect(countAt30s).toBeGreaterThan(0)

    // After 30s cap, no more fires.
    vi.advanceTimersByTime(10_000)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(countAt30s)
  })

  it('reassert() fires immediately', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()

    expect(send).not.toHaveBeenCalled()
    k.reassert()
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)

    k.stop()
  })

  it('reassert() is a no-op after stop()', async () => {
    const send = vi.fn(async () => {})
    const k = new TypingKeepalive({ send })
    k.start()
    k.stop()

    k.reassert()
    await flushMicrotasks()
    expect(send).not.toHaveBeenCalled()
  })

  it('swallows send() errors', async () => {
    const send = vi.fn(async () => {
      throw new Error('network blip')
    })
    const k = new TypingKeepalive({ send })
    k.start()

    vi.advanceTimersByTime(900)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(1)

    // Loop keeps going after the error.
    vi.advanceTimersByTime(2500)
    await flushMicrotasks()
    expect(send).toHaveBeenCalledTimes(2)

    k.stop()
  })
})

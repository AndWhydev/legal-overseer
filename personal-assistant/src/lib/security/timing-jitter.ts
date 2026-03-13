import { randomInt } from 'crypto'

/**
 * Adds random delay (50-200ms) before first stream token
 * to defeat latency-based model fingerprinting.
 */
export async function addTimingJitter(): Promise<void> {
  const jitter = randomInt(50, 201)
  await new Promise(resolve => setTimeout(resolve, jitter))
}

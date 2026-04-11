import { Composio } from '@composio/core'

let instance: Composio | null = null

/**
 * Singleton Composio client. Requires COMPOSIO_API_KEY env var.
 * Returns null if the key is not configured (graceful degradation).
 */
export function getComposioClient(): Composio | null {
  if (!process.env.COMPOSIO_API_KEY) return null
  if (!instance) {
    instance = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  }
  return instance
}

/**
 * Check whether Composio is available (API key configured).
 */
export function isComposioEnabled(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY)
}

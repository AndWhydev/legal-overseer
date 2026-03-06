import { timingSafeEqual, createHmac } from 'crypto'

/**
 * Timing-safe comparison of secrets to prevent timing attacks.
 *
 * Uses Node.js crypto.timingSafeEqual() which:
 * - Takes constant time regardless of where strings differ
 * - Prevents attackers from inferring valid prefixes via response timing
 * - Returns false if lengths differ (prevents length oracle)
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    )
  } catch {
    // timingSafeEqual throws if buffers are different lengths
    // Return false for any comparison error (safe default)
    return false
  }
}

/**
 * Verify webhook signature using HMAC SHA256.
 *
 * Generic utility for webhooks that use HMAC signatures.
 * Example: WhatsApp (x-hub-signature-256=sha256=...)
 */
export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  signaturePrefix: 'sha256=' | '' = 'sha256='
): boolean {
  try {
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = signaturePrefix + hmac.digest('hex')

    return timingSafeCompare(signature, expectedSignature)
  } catch {
    return false
  }
}

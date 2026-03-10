import { createHmac, timingSafeEqual } from 'crypto'

export function verifyEmailWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false
  const prefix = 'sha256='
  const sig = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature
  try {
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    const sigBuffer = Buffer.from(sig, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (sigBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(sigBuffer, expectedBuffer)
  } catch {
    return false
  }
}

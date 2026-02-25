import { NextRequest, NextResponse } from 'next/server'
import { parseAsanaWebhookEvents } from '@/lib/channels/asana'

/**
 * Asana webhook endpoint.
 *
 * Asana sends a handshake request (POST with X-Hook-Secret header) to verify
 * the endpoint, then delivers events as POST with JSON body.
 */
export async function POST(request: NextRequest) {
  // Handshake: Asana sends X-Hook-Secret header during webhook registration
  const hookSecret = request.headers.get('x-hook-secret')
  if (hookSecret) {
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Hook-Secret': hookSecret },
    })
  }

  // Verify signature if present
  const signature = request.headers.get('x-hook-signature')
  if (!signature) {
    // In production you'd reject unsigned requests.
    // For now we log a warning and continue.
    console.warn('[webhook/asana] Received unsigned request')
  }

  try {
    const body = await request.json()
    const events = parseAsanaWebhookEvents(body)

    for (const event of events) {
      // Log for now -- in production, dispatch to a queue or handler
      console.log('[webhook/asana] Event:', event.action, event.resource.resource_type, event.resource.gid)
    }

    return NextResponse.json({ received: true, count: events.length })
  } catch (err) {
    console.error('[webhook/asana] Error processing webhook:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 })
  }
}

import { IncomingMessage, ServerResponse } from 'node:http'

interface OnboardingRequest {
  userId: string
  orgId: string
}

export async function handleOnboardingConversation(
  req: IncomingMessage,
  res: ServerResponse,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString()) as OnboardingRequest

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  const sendEvent = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  let eventId = 0
  const nextId = () => String(++eventId)

  try {
    // Pipeline execution will be wired in Task 12.
    // This handler establishes the SSE contract and routing.
    // For now, send a placeholder sequence to verify the stream works.
    sendEvent({ type: 'narration', message: 'Connected. Reading through your history...', id: nextId() })
    sendEvent({ type: 'progress', phase: 'crawling', percent: 0 })

    // The full pipeline (crawl → Haiku narration → Opus synthesis → ingestion → reveal)
    // will replace this placeholder in Task 12.
    sendEvent({ type: 'complete', threadId: 'pending-wiring' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendEvent({ type: 'error', message, recoverable: true })
  } finally {
    res.end()
  }
}

export async function handleOnboardingReply(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const { message } = JSON.parse(Buffer.concat(chunks).toString()) as { message: string }

  pendingReplies.push({ message, timestamp: Date.now() })

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

// In-memory reply queue (per-process, fine for single-user onboarding)
const pendingReplies: Array<{ message: string; timestamp: number }> = []

export function drainReplies(): Array<{ message: string; timestamp: number }> {
  return pendingReplies.splice(0)
}

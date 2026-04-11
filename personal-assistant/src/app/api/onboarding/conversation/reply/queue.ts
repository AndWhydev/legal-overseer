import type { UserReply } from '@/lib/onboarding/stream-types'

/**
 * In-memory reply queue for onboarding conversations.
 *
 * The SSE stream (conversation/route.ts) drains replies from this queue
 * before each narration call. The reply route (reply/route.ts) pushes
 * user messages into it.
 *
 * Scoped per org_id so concurrent onboardings don't cross-contaminate.
 * Entries expire after 10 minutes to prevent memory leaks from abandoned sessions.
 */

interface ReplyQueue {
  push(reply: UserReply): void
  drain(): UserReply[]
}

const queues = new Map<string, UserReply[]>()

const EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

export function getReplyQueue(orgId: string): ReplyQueue {
  return {
    push(reply: UserReply) {
      if (!queues.has(orgId)) {
        queues.set(orgId, [])
        // Auto-cleanup after expiry
        setTimeout(() => queues.delete(orgId), EXPIRY_MS)
      }
      queues.get(orgId)!.push(reply)
    },
    drain(): UserReply[] {
      const items = queues.get(orgId) ?? []
      queues.set(orgId, [])
      return items
    },
  }
}

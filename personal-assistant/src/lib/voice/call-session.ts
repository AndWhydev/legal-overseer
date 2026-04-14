import { logger } from '@/lib/core/logger'

export interface CallSession {
  id: string
  status: 'initiated' | 'ringing' | 'active' | 'ended'
  phoneNumber: string
}

/**
 * Initiate a FaceTime audio call via Sendblue.
 * TODO: Implement when FaceTime calling feature is ready.
 */
export async function initiateFaceTimeCall(
  userId: string,
  orgId: string,
  phoneNumber: string,
): Promise<CallSession | null> {
  logger.warn('[call-session] FaceTime call initiation not yet implemented', { userId, orgId, phoneNumber })
  return null
}

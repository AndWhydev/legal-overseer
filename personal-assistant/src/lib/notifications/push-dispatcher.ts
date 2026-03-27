import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, unknown>
  badge?: number
}

export interface PushResult {
  success: boolean
  sent: number
  invalidTokens: string[]
  error?: string
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

// ---------------------------------------------------------------------------
// sendPushNotification -- Send to specific Expo push tokens
// ---------------------------------------------------------------------------

/**
 * Send push notifications to specific Expo push tokens via the Expo Push API.
 * Sends all tokens in a single API call (batch).
 * Returns invalid tokens for cleanup.
 */
export async function sendPushNotification(
  tokens: string[],
  notification: PushNotification,
): Promise<PushResult> {
  if (tokens.length === 0) {
    return { success: true, sent: 0, invalidTokens: [] }
  }

  try {
    const messages = tokens.map((to) => ({
      to,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      badge: notification.badge,
      sound: 'default' as const,
    }))

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      logger.warn('[push-dispatcher] Expo Push API returned non-OK status', {
        status: response.status,
      })
      return { success: false, sent: 0, invalidTokens: [], error: `HTTP ${response.status}` }
    }

    const result = await response.json() as { data: ExpoPushTicket[] }
    const tickets = result.data ?? []

    // Collect invalid tokens for cleanup
    const invalidTokens: string[] = []
    let sentCount = 0

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      if (ticket.status === 'ok') {
        sentCount++
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        const token = tokens[i]
        if (token) invalidTokens.push(token)
      }
    }

    // Clean up invalid tokens asynchronously
    if (invalidTokens.length > 0) {
      cleanupInvalidTokens(invalidTokens).catch((err) => {
        logger.warn('[push-dispatcher] Failed to clean up invalid tokens', { err })
      })
    }

    return { success: true, sent: sentCount, invalidTokens }
  } catch (err) {
    logger.warn('[push-dispatcher] Failed to send push notification', { err })
    return {
      success: false,
      sent: 0,
      invalidTokens: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// sendPushToUser -- Look up tokens and send
// ---------------------------------------------------------------------------

/**
 * Send a push notification to all of a user's registered devices.
 * Looks up tokens from push_tokens table using service-role client.
 * Returns gracefully if user has no registered tokens.
 */
export async function sendPushToUser(
  userId: string,
  notification: PushNotification,
): Promise<PushResult> {
  try {
    const supabase = getServiceClient()

    const { data: tokenRows, error } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    if (error) {
      logger.warn('[push-dispatcher] Failed to look up push tokens', { userId, error })
      return { success: false, sent: 0, invalidTokens: [], error: error.message }
    }

    if (!tokenRows || tokenRows.length === 0) {
      return { success: true, sent: 0, invalidTokens: [] }
    }

    const tokens = tokenRows.map((row: { token: string }) => row.token)
    return await sendPushNotification(tokens, notification)
  } catch (err) {
    logger.warn('[push-dispatcher] sendPushToUser failed', { userId, err })
    return {
      success: false,
      sent: 0,
      invalidTokens: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// cleanupInvalidTokens -- Remove expired/invalid tokens from DB
// ---------------------------------------------------------------------------

/**
 * Delete invalid/expired tokens from push_tokens table.
 * Called automatically when Expo Push API reports DeviceNotRegistered.
 */
export async function cleanupInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return

  try {
    const supabase = getServiceClient()

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .in('token', tokens)

    if (error) {
      logger.warn('[push-dispatcher] Failed to clean up invalid tokens', { error })
    }
  } catch (err) {
    logger.warn('[push-dispatcher] cleanupInvalidTokens error', { err })
  }
}

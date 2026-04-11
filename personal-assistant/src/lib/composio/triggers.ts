import { getComposioClient } from './client'
import type { ChannelType } from '../channels/types'
import { logger } from '../core/logger'

/**
 * Composio trigger types for real-time events.
 * These replace polling crons for supported channels.
 */
export const TRIGGER_TYPES: Partial<Record<ChannelType, string>> = {
  gmail: 'GMAIL_NEW_EMAIL',
  slack: 'SLACK_NEW_MESSAGE',
  stripe: 'STRIPE_PAYMENT_RECEIVED',
  calendar: 'GOOGLECALENDAR_EVENT_CREATED',
  asana: 'ASANA_TASK_CREATED',
}

export interface TriggerConfig {
  connectedAccountId: string
  triggerType: string
  webhookUrl: string
  config?: Record<string, unknown>
}

export interface ActiveTrigger {
  id: string
  triggerType: string
  status: string
  connectedAccountId: string
}

/**
 * Subscribe to a Composio trigger for real-time event delivery.
 * Events are POSTed to the webhookUrl as structured payloads.
 */
export async function createTrigger(config: TriggerConfig): Promise<ActiveTrigger | null> {
  const composio = getComposioClient()
  if (!composio) return null

  try {
    const result = await (composio as unknown as {
      triggers: {
        create: (opts: {
          connectedAccountId: string
          triggerType: string
          webhookUrl: string
          config?: Record<string, unknown>
        }) => Promise<{ id: string; status: string }>
      }
    }).triggers.create({
      connectedAccountId: config.connectedAccountId,
      triggerType: config.triggerType,
      webhookUrl: config.webhookUrl,
      config: config.config,
    })

    logger.info('[composio/triggers] Trigger created', {
      triggerId: result.id,
      type: config.triggerType,
    })

    return {
      id: result.id,
      triggerType: config.triggerType,
      status: result.status,
      connectedAccountId: config.connectedAccountId,
    }
  } catch (err) {
    logger.error('[composio/triggers] Failed to create trigger', {
      triggerType: config.triggerType,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Set up a trigger for a BitBit channel, given a connected account.
 */
export async function setupChannelTrigger(
  channel: ChannelType,
  connectedAccountId: string,
  baseUrl: string,
): Promise<ActiveTrigger | null> {
  const triggerType = TRIGGER_TYPES[channel]
  if (!triggerType) {
    logger.warn(`[composio/triggers] No trigger type defined for ${channel}`)
    return null
  }

  return createTrigger({
    connectedAccountId,
    triggerType,
    webhookUrl: `${baseUrl}/api/webhooks/composio`,
  })
}

/**
 * Delete/disable a trigger.
 */
export async function deleteTrigger(triggerId: string): Promise<boolean> {
  const composio = getComposioClient()
  if (!composio) return false

  try {
    await (composio as unknown as {
      triggers: { delete: (id: string) => Promise<void> }
    }).triggers.delete(triggerId)

    logger.info('[composio/triggers] Trigger deleted', { triggerId })
    return true
  } catch (err) {
    logger.error('[composio/triggers] Failed to delete trigger', {
      triggerId,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

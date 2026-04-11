import type { ConversationAdapter, ConversationNormalizationResult } from './interface'
import type { InboundSMS } from '@/lib/channels/sms'

export interface SMSConversationInput {
  orgId: string
  sms: InboundSMS
}

export const smsConversationAdapter: ConversationAdapter<SMSConversationInput> = {
  channel: 'sms',
  normalize(input: SMSConversationInput): ConversationNormalizationResult {
    const participantId = input.sms.from
    if (!participantId) {
      return {
        ok: false,
        error: {
          code: 'missing_participant',
          message: 'No sender phone number found in SMS',
        },
      }
    }

    return {
      ok: true,
      request: {
        channel: 'sms',
        orgId: input.orgId,
        participantId,
        text: input.sms.text,
        metadata: {
          to: input.sms.to,
          timestamp: input.sms.timestamp.toISOString(),
        },
        rawMessage: input.sms as unknown as Record<string, unknown>,
      },
    }
  },
}

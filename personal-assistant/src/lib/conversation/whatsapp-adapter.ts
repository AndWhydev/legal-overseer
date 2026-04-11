import type { ConversationAdapter, ConversationNormalizationResult } from './interface'

const VOICE_NOTE_PREFIX = '[Voice note] '

export interface WhatsAppConversationInput {
  orgId: string
  messageRow: Record<string, unknown>
  text: string
}

function prependVoiceNotePrefix(text: string, metadata: Record<string, unknown> | undefined): string {
  return metadata?.voice_note === true ? `${VOICE_NOTE_PREFIX}${text}` : text
}

export const whatsappConversationAdapter: ConversationAdapter<WhatsAppConversationInput> = {
  channel: 'whatsapp',
  normalize(input: WhatsAppConversationInput): ConversationNormalizationResult {
    const participantId = input.messageRow.sender_email as string
    if (!participantId) {
      return {
        ok: false,
        error: {
          code: 'missing_participant',
          message: 'No phone number found in message row',
        },
      }
    }

    const metadata = input.messageRow.metadata as Record<string, unknown> | undefined

    return {
      ok: true,
      request: {
        channel: 'whatsapp',
        orgId: input.orgId,
        participantId,
        text: prependVoiceNotePrefix(input.text, metadata),
        metadata,
        rawMessage: input.messageRow,
      },
    }
  },
}

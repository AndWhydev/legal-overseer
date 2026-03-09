import type { ConversationAdapter, ConversationNormalizationResult } from './interface'
import type { ChannelMessage } from '@/lib/channels/types'

export interface EmailConversationInput {
  orgId: string
  email: ChannelMessage
}

/**
 * Strips common email signature patterns from the body text.
 */
const SIGNATURE_PATTERNS = [
  /^-- \n[\s\S]*$/m,
  /^Sent from my [\s\S]*$/m,
  /^Get Outlook for [\s\S]*$/m,
  /^This is a confidential[\s\S]*$/m,
  /^On .+ wrote:[\s\S]*$/m,
  /^From: .*\nSent:[\s\S]*$/m,
]

function stripSignatures(body: string): string {
  let cleaned = body
  for (const pattern of SIGNATURE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  return cleaned.trim()
}

const COMMAND_PREFIXES = ['[BitBit]', '[BITBIT]', '!bitbit', '!']

function stripReplyPrefixes(subject: string): string {
  let cleaned = subject.replace(/^((RE:|FWD:|RE\[|FW:|Fwd:)\s*)+/gi, '').trim()
  for (const prefix of COMMAND_PREFIXES) {
    if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
      cleaned = cleaned.slice(prefix.length).trim()
    }
  }
  return cleaned
}

export const emailConversationAdapter: ConversationAdapter<EmailConversationInput> = {
  channel: 'email',
  normalize(input: EmailConversationInput): ConversationNormalizationResult {
    const participantId = input.email.senderEmail || input.email.sender
    if (!participantId) {
      return {
        ok: false,
        error: {
          code: 'missing_participant',
          message: 'No sender email found in message',
        },
      }
    }

    const subject = stripReplyPrefixes(input.email.subject || '')
    const body = stripSignatures(input.email.body || '')
    const text = body ? `${subject}\n\nContext: ${body}` : subject

    return {
      ok: true,
      request: {
        channel: 'email',
        orgId: input.orgId,
        participantId,
        text,
        metadata: {
          subject: input.email.subject,
          originalBody: input.email.body,
        },
        rawMessage: input.email.metadata,
      },
    }
  },
}

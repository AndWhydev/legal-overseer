import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage } from './types'
import { classifyMessage } from '@/lib/agent/classifier'
import { routeMessage } from '@/lib/agent/action-router'
import { runAgentChat, type EngineConfig } from '@/lib/agent/engine'
import { logger } from '@/lib/core/logger';
import { emailConversationAdapter } from '@/lib/conversation/email-adapter'
import { routeIncomingConversation } from '@/lib/conversation/interface'
import { sendCommandReplyEmail } from '@/lib/email/email-transport'

export interface ParsedCommand {
  commandText: string
  context: string
}

export interface FormattedEmail {
  subject: string
  htmlBody: string
}

export interface CommandResult {
  success: boolean
  agentResponse?: string
  emailQueued?: boolean
  error?: string
}

// Future: Support command email domains like cmd@bitbit.chat
// const COMMAND_DOMAINS = ['cmd.bitbit.chat', 'cmd-bitbit.chat', 'commands.bitbit.chat']
const COMMAND_PREFIXES = ['[BitBit]', '[BITBIT]', '!bitbit', '!']

/**
 * Email signature patterns to strip when parsing commands
 */
const SIGNATURE_PATTERNS = [
  /^-- \n[\s\S]*$/m, // Standard email signature separator
  /^Sent from my [\s\S]*$/m, // Apple Mail
  /^Get Outlook for [\s\S]*$/m, // Outlook
  /^This is a confidential[\s\S]*$/m, // Confidential footer
  /^__\nFaxes:[\s\S]*$/m, // Fax footer
  /^On .+ wrote:[\s\S]*$/m, // Gmail reply
  /^From: .*\nSent:[\s\S]*$/m, // Outlook reply
]

/**
 * Check if an email is intended as a command.
 * An email is a command if:
 * 1. Sent TO a command address (cmd.bitbit.chat, etc)
 * 2. OR has a command prefix in the subject ([BitBit], !)
 */
export function isCommandEmail(email: ChannelMessage): boolean {
  // Check subject for command prefixes
  const subject = email.subject || ''
  for (const prefix of COMMAND_PREFIXES) {
    if (subject.toLowerCase().includes(prefix.toLowerCase())) {
      return true
    }
  }

  // In the context of webhook handling, we can check metadata for TO address
  // if email system includes it. For now, subject prefix is primary detection.
  return false
}

/**
 * Parse an email into a command.
 * - Strips Re:/Fwd: from subject
 * - Extracts body before signature
 * - Returns command text and context
 */
export function parseEmailCommand(email: ChannelMessage): ParsedCommand {
  let commandText = email.subject || ''

  // Strip common reply/forward prefixes
  commandText = commandText.replace(/^(RE:|FWD:|RE\[|FW:|Fwd:)\s*/gi, '')

  // Add body as additional context if present and not too long
  let context = email.body || ''

  // Strip signatures from context
  for (const pattern of SIGNATURE_PATTERNS) {
    context = context.replace(pattern, '')
  }

  context = context.trim()

  // Combine subject and body into full command text
  if (context) {
    commandText = `${commandText}\n\nContext: ${context}`
  }

  return {
    commandText,
    context,
  }
}

/**
 * Format an agent response as an HTML email.
 * Returns email-client-friendly HTML with inline styles.
 */
export function formatEmailResponse(agentMessage: string, _senderEmail: string): FormattedEmail {
  const now = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 600px; margin: 0; padding: 20px; }
    .header { border-left: 4px solid #3b82f6; padding-left: 16px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 18px; color: #1f2937; }
    .header p { margin: 4px 0 0 0; font-size: 13px; color: #6b7280; }
    .content { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .content p { margin: 0 0 12px 0; }
    .footer { font-size: 12px; color: #9ca3af; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BitBit Response</h1>
      <p>Processed: ${now}</p>
    </div>
    <div class="content">
      ${agentMessage
        .split('\n\n')
        .map((para) => `<p>${para.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('')}
    </div>
    <div class="footer">
      <p>This is an automated response from your BitBit assistant.</p>
      <p>To reply to this email with another command, use the same format: subject as command, body as context.</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  return {
    subject: 'Re: BitBit Command Processed',
    htmlBody,
  }
}

/**
 * Full pipeline: process an email command through the agent.
 * - Validates it's a command email
 * - Normalizes via emailConversationAdapter (strips signatures, reply prefixes)
 * - Classifies and routes it
 * - Executes via agent engine
 * - Formats response as email
 * - Queues reply
 */
export async function processEmailCommand(
  client: SupabaseClient,
  orgId: string,
  email: ChannelMessage,
): Promise<CommandResult> {
  try {
    // Check if this is a command email
    if (!isCommandEmail(email)) {
      return {
        success: false,
        error: 'Email does not appear to be a command (missing command prefix)',
      }
    }

    logger.info('[email-command] Processing command from', email.sender)

    // Use the conversation adapter to normalize the email into a command request
    let commandText = ''
    let normalizationError: string | undefined

    await routeIncomingConversation(
      emailConversationAdapter,
      { orgId, email },
      async (request) => {
        commandText = request.text
      },
      (error) => {
        normalizationError = error.message
      },
    )

    if (normalizationError) {
      return {
        success: false,
        error: `Email normalization failed: ${normalizationError}`,
      }
    }

    if (!commandText || commandText.length === 0) {
      return {
        success: false,
        error: 'Could not extract command text from email',
      }
    }

    logger.info('[email-command] Parsed command:', commandText.slice(0, 100))

    // Classify the message
    const classification = await classifyMessage(client, email, orgId)
    logger.info('[email-command] Classification:', classification.category, `(sig: ${classification.significance})`)

    // Route the message
    const route = routeMessage(classification)
    logger.info('[email-command] Route decision:', route.decision)

    // Execute via agent engine
    let agentResponse = ''
    const engineConfig: EngineConfig = {
      orgId,
      supabase: client,
      skipCostGuard: true, // Email commands typically background agents
    }

    logger.info('[email-command] Running agent with command text')

    for await (const event of runAgentChat(commandText, engineConfig)) {
      if (event.type === 'message') {
        agentResponse += event.data
      } else if (event.type === 'error') {
        logger.error('[email-command] Agent error:', event.data)
        return {
          success: false,
          error: `Agent error: ${event.data}`,
        }
      } else if (event.type === 'content_delta') {
        agentResponse += event.data
      }
    }

    if (!agentResponse) {
      return {
        success: false,
        error: 'Agent produced no response',
      }
    }

    logger.info('[email-command] Agent response received, formatting email')

    // Format response as email
    const emailResponse = formatEmailResponse(agentResponse, email.senderEmail || '')

    // Send reply email via Resend
    const sent = await sendCommandReplyEmail(
      email.senderEmail || '',
      emailResponse.subject,
      emailResponse.htmlBody,
    )

    if (!sent) {
      logger.warn('[email-command] Email send failed, response was generated but not delivered')
    }

    return {
      success: true,
      agentResponse,
      emailQueued: sent,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[email-command] Error processing command:', errorMsg)
    return {
      success: false,
      error: `Error processing command: ${errorMsg}`,
    }
  }
}

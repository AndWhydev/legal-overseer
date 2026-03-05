export type ConversationChannel = 'whatsapp' | (string & {})

export interface ConversationCommandRequest {
  channel: ConversationChannel
  orgId: string
  participantId: string
  text: string
  metadata?: Record<string, unknown>
  rawMessage?: Record<string, unknown>
}

export interface ConversationNormalizationError {
  code: 'missing_participant' | 'invalid_payload'
  message: string
}

export type ConversationNormalizationResult =
  | {
      ok: true
      request: ConversationCommandRequest
    }
  | {
      ok: false
      error: ConversationNormalizationError
    }

export interface ConversationAdapter<TInput> {
  readonly channel: ConversationChannel
  normalize(input: TInput): ConversationNormalizationResult
}

export type ConversationCommandHandler = (request: ConversationCommandRequest) => Promise<void>
export type ConversationDropHandler = (error: ConversationNormalizationError) => void

/**
 * Channel-agnostic entry point for normalized conversational commands.
 * New channels only need an adapter + handler wiring.
 */
export async function routeIncomingConversation<TInput>(
  adapter: ConversationAdapter<TInput>,
  input: TInput,
  handler: ConversationCommandHandler,
  onDrop?: ConversationDropHandler
): Promise<void> {
  const normalized = adapter.normalize(input)
  if (!normalized.ok) {
    onDrop?.(normalized.error)
    return
  }

  await handler(normalized.request)
}

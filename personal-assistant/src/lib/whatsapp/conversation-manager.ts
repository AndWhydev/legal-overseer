import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCommand, type ParsedCommand } from './command-parser'
import { dispatchCommand } from './agent-dispatch'
import { formatResponse } from './response-formatter'
import { sendMessage } from '../channels/whatsapp'
import { resolveApproval, getPendingApprovals } from '../agent/approval-queue'

export interface ConversationState {
  userId: string
  orgId: string
  status: 'idle' | 'awaiting_confirmation' | 'awaiting_clarification' | 'awaiting_approval_decision'
  pendingCommand?: ParsedCommand
  pendingApprovalId?: string
  pendingClarification?: {
    originalText: string
    question: string
    options?: string[]
  }
  history: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>
  lastActivity: number
}

const SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

// In-memory sessions with TTL cleanup
const activeConversations = new Map<string, ConversationState>()

// Periodic cleanup of stale sessions
let cleanupInterval: ReturnType<typeof setInterval> | null = null

function ensureCleanupRunning(): void {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, state] of activeConversations) {
      if (now - state.lastActivity > SESSION_TTL_MS) {
        activeConversations.delete(key)
      }
    }
    if (activeConversations.size === 0 && cleanupInterval) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }
  }, 60_000)
}

function getOrCreateState(userId: string, orgId: string): ConversationState {
  ensureCleanupRunning()

  const existing = activeConversations.get(userId)
  if (existing) {
    // Check TTL
    if (Date.now() - existing.lastActivity > SESSION_TTL_MS) {
      activeConversations.delete(userId)
    } else {
      existing.lastActivity = Date.now()
      return existing
    }
  }

  const state: ConversationState = {
    userId,
    orgId,
    status: 'idle',
    history: [],
    lastActivity: Date.now(),
  }
  activeConversations.set(userId, state)
  return state
}

function resetState(state: ConversationState): void {
  state.status = 'idle'
  state.pendingCommand = undefined
  state.pendingApprovalId = undefined
  state.pendingClarification = undefined
}

function pushHistory(state: ConversationState, role: 'user' | 'assistant', text: string): void {
  state.history.push({ role, text, timestamp: Date.now() })
  if (state.history.length > 12) {
    state.history = state.history.slice(-12)
  }
  state.lastActivity = Date.now()
}

/**
 * Main entry point for all incoming WhatsApp messages.
 * Handles multi-turn conversations, confirmations, clarifications, and approvals.
 */
export async function handleIncomingMessage(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  text: string
): Promise<void> {
  const state = getOrCreateState(userId, orgId)
  pushHistory(state, 'user', text)

  try {
    // Branch based on conversation state
    switch (state.status) {
      case 'awaiting_confirmation':
        await handleConfirmation(supabase, state, text)
        return

      case 'awaiting_clarification':
        await handleClarification(supabase, state, text)
        return

      case 'awaiting_approval_decision':
        await handleApprovalDecision(supabase, state, text)
        return

      case 'idle':
      default:
        await handleNewMessage(supabase, state, text)
        return
    }
  } catch (error) {
    console.error('[conversation-manager] Error handling message:', error)
    const errorMsg = formatResponse.error(
      "Something went wrong on my end. Could you try that again?",
      getSuggestions(state)
    )
    await reply(state, errorMsg)
    resetState(state)
  }
}

async function handleNewMessage(
  supabase: SupabaseClient,
  state: ConversationState,
  text: string
): Promise<void> {
  const command = await parseCommand(supabase, state.orgId, text)

  // Low confidence or unknown intent -> error recovery with suggestions
  if (command.intent === 'unknown' || command.confidence < 0.5) {
    const suggestions = inferSuggestions(text)
    const msg = formatResponse.didNotUnderstand(text, suggestions)
    await reply(state, msg)
    return
  }

  // Moderate confidence -> clarification
  if (command.confidence < 0.7) {
    state.status = 'awaiting_clarification'
    state.pendingClarification = {
      originalText: text,
      question: `Did you mean *${command.intent.replace('_', ' ')}*?`,
      options: ['Yes', 'No, I meant something else'],
    }
    state.pendingCommand = command
    const msg = formatResponse.clarification(
      state.pendingClarification.question,
      state.pendingClarification.options
    )
    await reply(state, msg)
    return
  }

  // Handle approval intent specially — route to approval flow
  if (command.intent === 'approve') {
    await handleApproveIntent(supabase, state, command)
    return
  }

  // Check if this action requires confirmation
  const needsConfirmation = shouldConfirm(command)
  if (needsConfirmation) {
    state.status = 'awaiting_confirmation'
    state.pendingCommand = command
    const confirmMsg = buildConfirmationMessage(command)
    await reply(state, confirmMsg)
    return
  }

  // Direct execution
  const result = await dispatchCommand(supabase, state.orgId, command)
  pushHistory(state, 'assistant', result.response)
  await sendMessage(state.userId, result.response)
}

async function handleConfirmation(
  supabase: SupabaseClient,
  state: ConversationState,
  text: string
): Promise<void> {
  const normalized = text.trim().toLowerCase()
  const isYes = /^(y|yes|yep|yeah|ok|confirm|go|do it|sure)$/i.test(normalized)
  const isNo = /^(n|no|nah|nope|cancel|stop|nevermind|never mind)$/i.test(normalized)

  if (isYes && state.pendingCommand) {
    await reply(state, `Working on it...`)
    const result = await dispatchCommand(supabase, state.orgId, state.pendingCommand)
    pushHistory(state, 'assistant', result.response)
    await sendMessage(state.userId, result.response)
    resetState(state)
    return
  }

  if (isNo) {
    await reply(state, 'Cancelled. What else can I help with?')
    resetState(state)
    return
  }

  // Not a clear Y/N — maybe they're asking something new
  const newCommand = await parseCommand(supabase, state.orgId, text)
  if (newCommand.intent !== 'unknown' && newCommand.confidence >= 0.7) {
    // They changed their mind, process as new message
    resetState(state)
    await handleNewMessage(supabase, state, text)
    return
  }

  await reply(state, 'Please reply *Y* to confirm or *N* to cancel.')
}

async function handleClarification(
  supabase: SupabaseClient,
  state: ConversationState,
  text: string
): Promise<void> {
  const normalized = text.trim().toLowerCase()

  if (/^(y|yes|yep|yeah|1)$/i.test(normalized) && state.pendingCommand) {
    // They confirmed the intent guess
    resetState(state)
    state.pendingCommand!.confidence = 0.9 // Boost confidence since user confirmed
    const cmd = state.pendingCommand!
    state.pendingCommand = undefined

    if (shouldConfirm(cmd)) {
      state.status = 'awaiting_confirmation'
      state.pendingCommand = cmd
      const confirmMsg = buildConfirmationMessage(cmd)
      await reply(state, confirmMsg)
      return
    }

    const result = await dispatchCommand(supabase, state.orgId, cmd)
    pushHistory(state, 'assistant', result.response)
    await sendMessage(state.userId, result.response)
    return
  }

  // They said no or something else — re-parse fresh
  resetState(state)
  if (/^(n|no|2)$/i.test(normalized)) {
    await reply(state, "No worries. What would you like to do? Try *help* to see options.")
    return
  }

  // Process as a new message
  await handleNewMessage(supabase, state, text)
}

async function handleApproveIntent(
  supabase: SupabaseClient,
  state: ConversationState,
  command: ParsedCommand
): Promise<void> {
  const rawQuery = command.entities.rawQuery ?? ''

  // Check if there's a pending confirmation in the conversation
  if (state.pendingCommand) {
    // Route to confirmation handler
    const isApproved = rawQuery.includes('approved') || rawQuery === 'approved'
    const fakeText = isApproved ? 'Y' : 'N'
    state.status = 'awaiting_confirmation'
    await handleConfirmation(supabase, state, fakeText)
    return
  }

  // Handle indexed approval (e.g., "1Y", "2N")
  const indexedMatch = rawQuery.match(/^(\d+):(approved|rejected)$/)
  if (indexedMatch) {
    const index = parseInt(indexedMatch[1], 10)
    const decision = indexedMatch[2] as 'approved' | 'rejected'
    await resolveIndexedApproval(supabase, state, index, decision)
    return
  }

  // Simple Y/N approval — find the most recent pending approval
  const pendingApprovals = await getPendingApprovals(supabase, state.orgId, { limit: 1 })
  if (pendingApprovals.length === 0) {
    await reply(state, "No pending approvals right now. You're all caught up!")
    return
  }

  const approval = pendingApprovals[0]
  const decision = rawQuery === 'approved' ? 'approved' : 'rejected'

  try {
    await resolveApproval(supabase, approval.id, decision, state.userId, 'whatsapp')
    const emoji = decision === 'approved' ? '✅' : '❌'
    await reply(state, `${emoji} ${approval.action_summary} — *${decision}*`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    if (errMsg === 'APPROVAL_ALREADY_RESOLVED') {
      await reply(state, 'That approval has already been resolved.')
    } else {
      await reply(state, `Failed to process approval: ${errMsg}`)
    }
  }
}

async function resolveIndexedApproval(
  supabase: SupabaseClient,
  state: ConversationState,
  index: number,
  decision: 'approved' | 'rejected'
): Promise<void> {
  const approvals = await getPendingApprovals(supabase, state.orgId, { limit: 10 })

  if (index < 1 || index > approvals.length) {
    await reply(state, `Invalid number. You have ${approvals.length} pending approval(s). Use 1-${approvals.length}.`)
    return
  }

  const approval = approvals[index - 1]
  try {
    await resolveApproval(supabase, approval.id, decision, state.userId, 'whatsapp')
    const emoji = decision === 'approved' ? '✅' : '❌'
    await reply(state, `${emoji} #${index} ${approval.action_summary} — *${decision}*`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    await reply(state, `Failed: ${errMsg}`)
  }
}

async function handleApprovalDecision(
  supabase: SupabaseClient,
  state: ConversationState,
  text: string
): Promise<void> {
  if (!state.pendingApprovalId) {
    resetState(state)
    await handleNewMessage(supabase, state, text)
    return
  }

  const normalized = text.trim().toLowerCase()
  const isApprove = /^(y|yes|approve|ok|go)$/i.test(normalized)
  const isReject = /^(n|no|reject|cancel)$/i.test(normalized)

  if (!isApprove && !isReject) {
    await reply(state, 'Please reply *Y* to approve or *N* to reject.')
    return
  }

  const decision = isApprove ? 'approved' : 'rejected'
  try {
    await resolveApproval(supabase, state.pendingApprovalId, decision, state.userId, 'whatsapp')
    const emoji = decision === 'approved' ? '✅' : '❌'
    await reply(state, `${emoji} Action *${decision}*.`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    await reply(state, `Failed: ${errMsg}`)
  }

  resetState(state)
}

function shouldConfirm(command: ParsedCommand): boolean {
  // Actions that create or modify data need confirmation
  return ['invoice', 'task_create'].includes(command.intent)
}

function buildConfirmationMessage(command: ParsedCommand): string {
  switch (command.intent) {
    case 'invoice': {
      const contact = command.resolvedContacts?.[0]?.contact?.name
        ?? command.entities.contactNames?.[0]
        ?? 'Unknown'
      const amount = command.entities.amounts?.[0]
        ? `$${command.entities.amounts[0].toLocaleString()}`
        : 'amount TBD'
      const project = command.entities.projectReference
        ? ` for *${command.entities.projectReference}*`
        : ''
      return formatResponse.confirmation(
        `Create invoice for *${contact}* (${amount})${project}?`,
        'Y to confirm, N to cancel'
      )
    }

    case 'task_create': {
      const title = command.entities.rawQuery ?? 'Untitled task'
      return formatResponse.confirmation(
        `Create task: "${title}"?`,
        'Y to confirm, N to cancel'
      )
    }

    default:
      return formatResponse.confirmation(
        `Proceed with *${command.intent.replace('_', ' ')}*?`,
        'Y to confirm, N to cancel'
      )
  }
}

function getSuggestions(_state: ConversationState): string[] {
  return [
    'Check leads',
    'Invoice status',
    'Create a task',
    'What\'s on today?',
  ]
}

function inferSuggestions(text: string): string[] {
  const lower = text.toLowerCase()
  const suggestions: string[] = []

  if (lower.includes('money') || lower.includes('pay') || lower.includes('bill') || lower.includes('$')) {
    suggestions.push('Invoice [name] for $[amount]')
    suggestions.push('What invoices are overdue?')
  }
  if (lower.includes('call') || lower.includes('meet') || lower.includes('tomorrow') || lower.includes('today')) {
    suggestions.push("What's on my calendar today?")
    suggestions.push('Schedule a call with [name]')
  }
  if (lower.includes('lead') || lower.includes('prospect') || lower.includes('new')) {
    suggestions.push('Any new leads?')
    suggestions.push('Lead pipeline status')
  }

  if (suggestions.length === 0) {
    suggestions.push('Check leads', 'Invoice status', 'Create a task', 'Help')
  }

  return suggestions.slice(0, 4)
}

async function reply(state: ConversationState, text: string): Promise<void> {
  pushHistory(state, 'assistant', text)
  await sendMessage(state.userId, text)
}

/** Expose for testing */
export function _getActiveConversations(): Map<string, ConversationState> {
  return activeConversations
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCommand, type ParsedCommand } from './command-parser'
import { dispatchCommand } from './agent-dispatch'
import { sendMessage } from '../channels/whatsapp'

export interface ConversationState {
  userId: string
  orgId: string
  status: 'idle' | 'awaiting_confirmation' | 'awaiting_clarification'
  pendingCommand?: ParsedCommand
  pendingAction?: any
  history: Array<{ role: 'user' | 'assistant'; text: string }>
}

// In-memory state for simplicity during this phase. 
// Ideally, this would be backed by Supabase `agent_sessions`.
const activeConversations = new Map<string, ConversationState>()

function getOrCreateState(userId: string, orgId: string): ConversationState {
  let state = activeConversations.get(userId)
  if (!state) {
    state = {
      userId,
      orgId,
      status: 'idle',
      history: []
    }
    activeConversations.set(userId, state)
  }
  return state
}

export async function handleIncomingMessage(
  supabase: SupabaseClient,
  orgId: string,
  userId: string, // phone number
  text: string
): Promise<void> {
  const state = getOrCreateState(userId, orgId)
  state.history.push({ role: 'user', text })

  // Keep history manageable
  if (state.history.length > 10) {
    state.history = state.history.slice(-10)
  }

  if (state.status === 'awaiting_confirmation') {
    const isYes = text.trim().toLowerCase() === 'y' || text.trim().toLowerCase() === 'yes'
    const isNo = text.trim().toLowerCase() === 'n' || text.trim().toLowerCase() === 'no'

    if (isYes && state.pendingCommand) {
      // Execute the pending action
      await sendMessage(userId, `Executing ${state.pendingCommand.intent}...`)
      const result = await dispatchCommand(supabase, orgId, state.pendingCommand)
      await sendMessage(userId, result.response)
      state.status = 'idle'
      state.pendingCommand = undefined
    } else if (isNo) {
      await sendMessage(userId, 'Cancelled.')
      state.status = 'idle'
      state.pendingCommand = undefined
    } else {
      await sendMessage(userId, 'Please reply Y or N.')
    }
    return
  }

  // Normal processing
  const command = await parseCommand(supabase, orgId, text)
  
  if (command.intent === 'unknown' || command.confidence < 0.6) {
    // If we're not sure, just pass it to the agent to figure out or ask for clarification
    const result = await dispatchCommand(supabase, orgId, command)
    await sendMessage(userId, result.response)
    return
  }

  // Check if we need confirmation for destructive/important actions
  const requiresConfirmation = ['invoice'].includes(command.intent)
  
  if (requiresConfirmation) {
    let confirmationText = `Are you sure you want to proceed with: ${command.intent}?`
    
    if (command.intent === 'invoice') {
      const contact = command.resolvedContacts?.[0]?.contact?.name || command.entities.contactNames?.[0] || 'Unknown'
      const amount = command.entities.amounts?.[0] ? `$${command.entities.amounts[0]}` : 'Unknown amount'
      confirmationText = `Create an invoice for ${contact} for ${amount}?\nReply Y to confirm or N to cancel.`
    }

    state.status = 'awaiting_confirmation'
    state.pendingCommand = command
    await sendMessage(userId, confirmationText)
    return
  }

  // Direct execution
  const result = await dispatchCommand(supabase, orgId, command)
  state.history.push({ role: 'assistant', text: result.response })
  await sendMessage(userId, result.response)
}

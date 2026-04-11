/**
 * Swarm Participant Registry — register and lookup SwarmParticipant implementations.
 */

import type { SwarmParticipant } from './types'

const participants = new Map<string, SwarmParticipant>()

/**
 * Register a SwarmParticipant implementation for an agent type.
 * Call at module load time or during initialization.
 */
export function registerParticipant(participant: SwarmParticipant & { agent_type?: string }): void {
  participants.set(participant.agent_type ?? participant.role, participant)
}

/**
 * Get a registered participant by agent type.
 */
export function getParticipant(agentType: string): SwarmParticipant | undefined {
  return participants.get(agentType)
}

/**
 * List all registered participant types.
 */
export function listParticipantTypes(): string[] {
  return Array.from(participants.keys())
}

/**
 * Agent Registry
 *
 * Central registry for all BitBit agent definitions.
 * Agents register themselves with their capabilities, tool requirements,
 * and default configurations. Deployments can override configs per-org.
 */

import type { AgentType, ModelTier, ConfidenceThresholds } from './types'

export interface AgentDefinition {
  type: AgentType
  name: string
  description: string
  version: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'

  // What this agent needs
  required_channels: string[]
  optional_channels: string[]
  required_tools: string[]

  // Defaults (overridable per-org)
  default_model_tier: ModelTier
  default_confidence_thresholds: ConfidenceThresholds
  default_schedule: {
    type: 'continuous' | 'interval' | 'cron'
    interval_seconds?: number
    cron_expression?: string
  }

  // Entry point
  handler: string // path to agent handler module
}

const registry = new Map<AgentType, AgentDefinition>()

export function registerAgent(definition: AgentDefinition): void {
  if (registry.has(definition.type)) {
    console.warn(`Agent "${definition.type}" already registered, overwriting.`)
  }
  registry.set(definition.type, definition)
}

export function getAgent(type: AgentType): AgentDefinition | undefined {
  return registry.get(type)
}

export function listAgents(): AgentDefinition[] {
  return Array.from(registry.values()).sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })
}

// Auto-registration happens when agent packages are imported.
// Each agent's index.ts calls registerAgent() on load.

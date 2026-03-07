/**
 * Agent Registry
 *
 * Central registry for all BitBit agent definitions.
 * Agents register themselves with their capabilities, tool requirements,
 * and default configurations. Deployments can override configs per-org.
 */

import type { AgentType, AgentConfig, ConfidenceThresholds, ModelTier } from './types'
import type { AgentRegistryEntry } from './types'

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

interface RegistryRecord {
  definition: AgentDefinition
  registered_at: Date
}

const registry = new Map<AgentType, RegistryRecord>()

const SEMVER_PATTERN = /^\d+\.\d+\.\d+/

/**
 * Validate an agent definition, returning an array of error strings (empty = valid).
 */
export function validateDefinition(def: AgentDefinition): string[] {
  const errors: string[] = []
  if (!def.type) errors.push('type is required')
  if (!def.name) errors.push('name is required')
  if (!def.version || !SEMVER_PATTERN.test(def.version)) {
    errors.push('version must match semver pattern (e.g. 1.0.0)')
  }
  if (!def.handler) errors.push('handler is required')
  if (def.default_confidence_thresholds) {
    const { act, ask } = def.default_confidence_thresholds
    if (act < 0 || act > 1) errors.push('confidence act threshold must be 0-1')
    if (ask < 0 || ask > 1) errors.push('confidence ask threshold must be 0-1')
    if (act <= ask) errors.push('confidence act threshold must be greater than ask threshold')
  }
  return errors
}

export function registerAgent(definition: AgentDefinition): void {
  const errors = validateDefinition(definition)
  if (errors.length > 0) {
    logger.warn(`Agent "${definition.type}" has validation issues: ${errors.join(', ')}`)
  }
  if (registry.has(definition.type)) {
    logger.warn(`Agent "${definition.type}" already registered, overwriting.`)
  }
  registry.set(definition.type, { definition, registered_at: new Date() })
}

export function getAgent(type: AgentType): AgentDefinition | undefined {
  return registry.get(type)?.definition
}

export function listAgents(): AgentDefinition[] {
  return Array.from(registry.values())
    .map((r) => r.definition)
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
}

/**
 * Returns all registered agent types.
 */
export function getRegisteredTypes(): AgentType[] {
  return Array.from(registry.keys())
}

/**
 * Merge code-level defaults from AgentDefinition with DB-level AgentConfig for an org.
 * DB values override code defaults. If no DB config exists for this agent/org,
 * a config is synthesized from definition defaults.
 *
 * @param type - Agent type to look up
 * @param orgId - Organization ID
 * @param dbConfigs - Array of DB agent configs (caller fetches these)
 */
export function getAgentConfig(
  type: AgentType,
  orgId: string,
  dbConfigs: AgentConfig[]
): AgentRegistryEntry | null {
  const record = registry.get(type)
  if (!record) return null

  const { definition, registered_at } = record
  const dbConfig = dbConfigs.find((c) => c.agent_type === type && c.org_id === orgId)

  const config: AgentConfig = dbConfig ?? {
    id: `default-${type}-${orgId}`,
    org_id: orgId,
    agent_type: type,
    name: definition.name,
    description: definition.description,
    enabled: true,
    policy_rules: {},
    channel_access: [...definition.required_channels, ...definition.optional_channels],
    model_tier_override: definition.default_model_tier,
    confidence_thresholds: { ...definition.default_confidence_thresholds },
    notification_config: { channels: [], targets: [], escalation_delay_minutes: 15 },
    schedule: {
      type: definition.default_schedule.type,
      interval_seconds: definition.default_schedule.interval_seconds,
      cron_expression: definition.default_schedule.cron_expression,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return { definition, config, registered_at }
}

// Auto-registration happens when agent packages are imported.
// Each agent's index.ts calls registerAgent() on load.

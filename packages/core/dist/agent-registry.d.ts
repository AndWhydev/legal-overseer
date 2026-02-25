/**
 * Agent Registry
 *
 * Central registry for all BitBit agent definitions.
 * Agents register themselves with their capabilities, tool requirements,
 * and default configurations. Deployments can override configs per-org.
 */
import type { AgentType, AgentConfig, ConfidenceThresholds, ModelTier } from './types';
import type { AgentRegistryEntry } from './types';
export interface AgentDefinition {
    type: AgentType;
    name: string;
    description: string;
    version: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    required_channels: string[];
    optional_channels: string[];
    required_tools: string[];
    default_model_tier: ModelTier;
    default_confidence_thresholds: ConfidenceThresholds;
    default_schedule: {
        type: 'continuous' | 'interval' | 'cron';
        interval_seconds?: number;
        cron_expression?: string;
    };
    handler: string;
}
/**
 * Validate an agent definition, returning an array of error strings (empty = valid).
 */
export declare function validateDefinition(def: AgentDefinition): string[];
export declare function registerAgent(definition: AgentDefinition): void;
export declare function getAgent(type: AgentType): AgentDefinition | undefined;
export declare function listAgents(): AgentDefinition[];
/**
 * Returns all registered agent types.
 */
export declare function getRegisteredTypes(): AgentType[];
/**
 * Merge code-level defaults from AgentDefinition with DB-level AgentConfig for an org.
 * DB values override code defaults. If no DB config exists for this agent/org,
 * a config is synthesized from definition defaults.
 *
 * @param type - Agent type to look up
 * @param orgId - Organization ID
 * @param dbConfigs - Array of DB agent configs (caller fetches these)
 */
export declare function getAgentConfig(type: AgentType, orgId: string, dbConfigs: AgentConfig[]): AgentRegistryEntry | null;
//# sourceMappingURL=agent-registry.d.ts.map
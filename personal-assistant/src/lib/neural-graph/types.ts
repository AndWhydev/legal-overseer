/**
 * Neural Knowledge Graph Types
 *
 * Core types for the brain-like associative memory system with Hebbian learning,
 * spreading activation, temporal decay, and co-occurrence extraction.
 */

export type NeuralNodeType = 'Person' | 'Organization' | 'Topic' | 'Concept' | 'Project' | 'Skill' | 'Event' | 'Location' | 'Decision'

export type SynapseType = 'RELATES_TO' | 'CO_OCCURS' | 'LEADS_TO' | 'PART_OF' | 'DERIVES_FROM' | 'MENTIONED_IN' | 'DISCUSSED' | 'CONTACTED_BY'

export interface NeuralNode {
  id: string
  entityId: string
  nodeType: NeuralNodeType
  name: string
  description: string | null
  aliases: string[]
  activationLevel: number
  fireCount: number
  lastFiredAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface Synapse {
  id: string
  sourceId: string
  targetId: string
  edgeType: SynapseType
  weight: number
  fireCount: number
  lastFiredAt: string
  decayRate: number
}

export interface ActivationResult {
  entityId: string
  nodeType: string
  name: string
  activation: number
  depth: number
  path: string[]
}

export interface GraphCluster {
  id: string
  label: string
  nodeIds: string[]
  avgWeight: number
}

export interface NeuralGraphStats {
  nodeCount: number
  edgeCount: number
  avgWeight: number
  topNodes: { entityId: string; name: string; fireCount: number }[]
  hotTopics: { entityId: string; name: string; recentActivation: number }[]
}

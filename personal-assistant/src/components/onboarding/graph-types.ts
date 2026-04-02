export type GraphNodeType = 'user' | 'person' | 'project' | 'financial'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  sublabel: string
  size: number
  color: string
  data: Record<string, unknown>
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export interface GraphEdge {
  source: string
  target: string
  type: 'contacted' | 'works-on' | 'owes' | 'shared-project'
  strength: number
  dashed: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const NODE_COLORS: Record<GraphNodeType, string> = {
  user: 'rgba(255, 255, 255, 0.4)',
  person: 'rgba(34, 197, 94, 0.5)',
  project: 'rgba(59, 130, 246, 0.5)',
  financial: 'rgba(234, 179, 8, 0.5)',
}

export const NODE_BASE_SIZES: Record<GraphNodeType, number> = {
  user: 32,
  person: 18,
  project: 16,
  financial: 14,
}

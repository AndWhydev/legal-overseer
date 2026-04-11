'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import type { GraphNode, GraphEdge } from './graph-types'

interface SimulationNode extends GraphNode, SimulationNodeDatum {}
interface SimulationLink extends SimulationLinkDatum<SimulationNode> {
  type: GraphEdge['type']
  strength: number
  dashed: boolean
}

export function useGraphSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onTick: (nodes: SimulationNode[], links: SimulationLink[]) => void,
) {
  const simRef = useRef<Simulation<SimulationNode, SimulationLink> | null>(null)
  const nodesRef = useRef<SimulationNode[]>([])
  const linksRef = useRef<SimulationLink[]>([])

  useEffect(() => {
    const simNodes: SimulationNode[] = nodes.map(n => ({ ...n }))
    const simLinks: SimulationLink[] = edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      strength: e.strength,
      dashed: e.dashed,
    }))

    // Pin the center "user" node
    const userNode = simNodes.find(n => n.type === 'user')
    if (userNode) {
      userNode.fx = width / 2
      userNode.fy = height / 2
    }

    nodesRef.current = simNodes
    linksRef.current = simLinks

    const sim = forceSimulation<SimulationNode>(simNodes)
      .force('link', forceLink<SimulationNode, SimulationLink>(simLinks)
        .id(d => d.id)
        .distance(120)
        .strength(0.3))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimulationNode>().radius(d => d.size + 8))
      .on('tick', () => onTick(nodesRef.current, linksRef.current))

    simRef.current = sim

    return () => {
      sim.stop()
    }
  }, [nodes, edges, width, height, onTick])

  const dragNode = useCallback((nodeId: string, x: number, y: number) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node) {
      node.fx = x
      node.fy = y
      simRef.current?.alpha(0.3).restart()
    }
  }, [])

  const releaseNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (node && node.type !== 'user') {
      node.fx = null
      node.fy = null
    }
  }, [])

  return { dragNode, releaseNode }
}

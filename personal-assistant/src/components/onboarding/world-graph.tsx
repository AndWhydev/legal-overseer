'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import { useGraphSimulation } from './use-graph-simulation'
import { GraphDetailPanel } from './graph-detail-panel'
import { NODE_COLORS, type GraphNode, type GraphEdge, type GraphData } from './graph-types'
import type { RevealWorldModel } from '@/lib/onboarding/stream-types'

interface WorldGraphProps {
  worldModel: RevealWorldModel
  stats: { totalMessages: number; peopleFound: number; projectsFound: number; financialsFound: number }
  onCorrection?: (nodeId: string, field: string, value: string) => void
}

function buildGraphData(model: RevealWorldModel): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  // Center node
  nodes.push({
    id: 'user',
    type: 'user',
    label: model.user.name || 'You',
    sublabel: model.user.businessName || '',
    size: 32,
    color: NODE_COLORS.user,
    data: model.user as unknown as Record<string, unknown>,
  })

  // People
  for (const person of model.people) {
    const size = Math.min(26, Math.max(12, 10 + Math.log2(person.messageCount + 1) * 4))
    nodes.push({
      id: person.id,
      type: 'person',
      label: person.name,
      sublabel: `${person.messageCount} msgs`,
      size,
      color: NODE_COLORS.person,
      data: person as unknown as Record<string, unknown>,
    })
    if (person.frequency !== 'rare') {
      edges.push({
        source: 'user',
        target: person.id,
        type: 'contacted',
        strength: person.frequency === 'daily' ? 1 : person.frequency === 'weekly' ? 0.7 : 0.4,
        dashed: false,
      })
    }
  }

  // Projects
  for (const project of model.projects) {
    const pId = `proj-${project.id}`
    nodes.push({
      id: pId,
      type: 'project',
      label: project.name,
      sublabel: project.status,
      size: 16,
      color: NODE_COLORS.project,
      data: project as unknown as Record<string, unknown>,
    })
    for (const personName of project.people) {
      const personNode = nodes.find(n => n.type === 'person' && n.label.toLowerCase() === personName.toLowerCase())
      if (personNode) {
        edges.push({
          source: personNode.id,
          target: pId,
          type: 'works-on',
          strength: 0.5,
          dashed: false,
        })
      }
    }
  }

  // Financials
  for (const fin of model.financials) {
    const fId = `fin-${fin.id}`
    nodes.push({
      id: fId,
      type: 'financial',
      label: `${fin.amount}`,
      sublabel: fin.entity,
      size: 14,
      color: NODE_COLORS.financial,
      data: fin as unknown as Record<string, unknown>,
    })
    const personNode = nodes.find(n =>
      n.type === 'person' &&
      (n.label.toLowerCase().includes(fin.entity.toLowerCase()) ||
       fin.entity.toLowerCase().includes(n.label.toLowerCase()))
    )
    if (personNode) {
      edges.push({
        source: personNode.id,
        target: fId,
        type: 'owes',
        strength: 0.6,
        dashed: false,
      })
    }
  }

  return { nodes, edges }
}

export function WorldGraph({ worldModel, stats, onCorrection }: WorldGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })

  const graphData = buildGraphData(worldModel)

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Canvas rendering callback
  const handleTick = useCallback((nodes: GraphNode[], links: Array<{ source: unknown; target: unknown; strength: number; dashed: boolean }>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, dimensions.width, dimensions.height)

    // Draw edges
    for (const link of links) {
      const source = link.source as GraphNode
      const target = link.target as GraphNode
      if (source.x == null || source.y == null || target.x == null || target.y == null) continue
      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.strokeStyle = `rgba(255, 255, 255, ${link.strength * 0.12})`
      ctx.lineWidth = 1
      if (link.dashed) ctx.setLineDash([4, 4])
      else ctx.setLineDash([])
      ctx.stroke()
    }

    // Draw nodes
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue
      const isSelected = selectedNode?.id === node.id

      ctx.beginPath()
      if (node.type === 'project' || node.type === 'financial') {
        const w = node.size * 3
        const h = node.size * 1.5
        const r = 6
        const x = node.x - w / 2
        const y = node.y - h / 2
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y, x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x, y + h, r)
        ctx.arcTo(x, y + h, x, y, r)
        ctx.arcTo(x, y, x + w, y, r)
      } else {
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2)
      }
      ctx.fillStyle = '#09090b'
      ctx.fill()
      ctx.strokeStyle = isSelected ? node.color.replace('0.5', '0.9') : node.color
      ctx.lineWidth = isSelected ? 2 : 1.5
      ctx.stroke()

      // Label
      ctx.fillStyle = '#fafafa'
      ctx.font = `${Math.max(9, node.size * 0.55)}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.label, node.x, node.y - 2)

      // Sublabel
      if (node.sublabel) {
        ctx.fillStyle = '#71717a'
        ctx.font = `${Math.max(7, node.size * 0.4)}px Inter, system-ui, sans-serif`
        ctx.fillText(node.sublabel, node.x, node.y + node.size * 0.45)
      }
    }
  }, [dimensions, selectedNode])

  const { dragNode, releaseNode } = useGraphSimulation(
    graphData.nodes,
    graphData.edges,
    dimensions.width,
    dimensions.height,
    handleTick,
  )

  // Click handler
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    let closest: GraphNode | null = null
    let closestDist = Infinity

    for (const node of graphData.nodes) {
      if (node.x == null || node.y == null) continue
      const dist = Math.hypot(node.x - x, node.y - y)
      if (dist < node.size + 8 && dist < closestDist) {
        closest = node
        closestDist = dist
      }
    }

    setSelectedNode(closest)
  }, [graphData.nodes])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex gap-0 w-full rounded-xl border bg-card overflow-hidden"
      style={{ height: 420 }}
    >
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair"
          style={{ width: '100%', height: '100%' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.4 }}
          className="absolute bottom-3 left-3 right-3 flex justify-center gap-6 text-xs text-muted-foreground"
        >
          <span>{stats.peopleFound} people</span>
          <span>{stats.projectsFound} projects</span>
          <span>{stats.financialsFound} financials</span>
          <span>{stats.totalMessages} messages scanned</span>
        </motion.div>
      </div>

      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onCorrection={onCorrection}
        />
      )}
    </motion.div>
  )
}

'use client'

import React, { useEffect, useRef, useCallback } from 'react'

export interface GraphNode {
  id: string
  label: string
  type: 'Person' | 'Organization' | 'Topic'
  data?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  label?: string
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (node: GraphNode) => void
  height?: number
}

// Internal simulation node
interface SimNode {
  id: string
  label: string
  type: GraphNode['type']
  data?: Record<string, unknown>
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
  edges: number // connection count for sizing
}

const NODE_COLORS: Record<string, string> = {
  Person: '#6b8fc9',
  Organization: '#4ba383',
  Topic: '#c4934a',
  contact: '#6b8fc9',
  project: '#4ba383',
  invoice: '#c4934a',
  task: '#9b88b8',
}

function getColor(type: string): string {
  return NODE_COLORS[type] ?? '#6b8fc9'
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

const GraphViewer: React.FC<Props> = ({ nodes, edges, onNodeClick, height = 420 }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [renderKey, setRenderKey] = React.useState(0) // triggers re-render after buildSim
  const simRef = useRef<{
    nodes: SimNode[]
    nodeMap: Map<string, SimNode>
    alpha: number
    running: boolean
    rafId: number
    width: number
    height: number
    pan: { x: number; y: number }
    scale: number
    drag: { node: SimNode; offsetX: number; offsetY: number } | null
    panning: { startX: number; startY: number; panX: number; panY: number } | null
    selected: string | null
    hovered: string | null
  }>({
    nodes: [],
    nodeMap: new Map(),
    alpha: 1,
    running: false,
    rafId: 0,
    width: 800,
    height: 420,
    pan: { x: 0, y: 0 },
    scale: 1,
    drag: null,
    panning: null,
    selected: null,
    hovered: null,
  })

  // Build simulation data from props
  const buildSim = useCallback(() => {
    const sim = simRef.current
    const w = sim.width
    const h = sim.height

    // Count edges per node
    const edgeCount = new Map<string, number>()
    for (const e of edges) {
      edgeCount.set(e.source, (edgeCount.get(e.source) ?? 0) + 1)
      edgeCount.set(e.target, (edgeCount.get(e.target) ?? 0) + 1)
    }

    const cx = w / 2
    const cy = h / 2

    sim.nodes = nodes.map((n, i) => {
      // Spread nodes in a circle initially
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      const radius = Math.min(w, h) * 0.3
      return {
        id: n.id,
        label: n.label,
        type: n.type,
        data: n.data,
        x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        pinned: false,
        edges: edgeCount.get(n.id) ?? 0,
      }
    })

    sim.nodeMap = new Map(sim.nodes.map(n => [n.id, n]))
    sim.alpha = 1
    // Trigger React re-render so SVG elements get created
    setRenderKey(k => k + 1)
  }, [nodes, edges])

  // Physics tick
  const tick = useCallback(() => {
    const sim = simRef.current
    const { nodes: sNodes, nodeMap } = sim
    const cx = sim.width / 2
    const cy = sim.height / 2

    for (let i = 0; i < sNodes.length; i++) {
      if (sNodes[i].pinned) continue
      let fx = 0
      let fy = 0

      // Repulsion (all pairs)
      for (let j = 0; j < sNodes.length; j++) {
        if (i === j) continue
        const dx = sNodes[j].x - sNodes[i].x
        const dy = sNodes[j].y - sNodes[i].y
        const distSq = dx * dx + dy * dy + 200
        const dist = Math.sqrt(distSq)
        const force = -200 / distSq
        fx += (force * dx) / dist
        fy += (force * dy) / dist
      }

      // Spring attraction (connected edges)
      for (const e of edges) {
        let target: SimNode | undefined
        if (e.source === sNodes[i].id) target = nodeMap.get(e.target)
        else if (e.target === sNodes[i].id) target = nodeMap.get(e.source)
        if (!target) continue

        const dx = target.x - sNodes[i].x
        const dy = target.y - sNodes[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) + 1
        const idealDist = 120
        const force = (dist - idealDist) * 0.05
        fx += force * (dx / dist)
        fy += force * (dy / dist)
      }

      // Center gravity
      fx += (cx - sNodes[i].x) * 0.002
      fy += (cy - sNodes[i].y) * 0.002

      // Apply with alpha cooling
      sNodes[i].vx = (sNodes[i].vx + fx * sim.alpha) * 0.88
      sNodes[i].vy = (sNodes[i].vy + fy * sim.alpha) * 0.88
      sNodes[i].x += sNodes[i].vx
      sNodes[i].y += sNodes[i].vy
    }

    // Cool down
    sim.alpha *= 0.995
  }, [edges])

  // Render to SVG DOM directly (no React re-render)
  const render = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const sim = simRef.current
    const g = svg.querySelector('#graph-content') as SVGGElement | null
    if (!g) return

    // Update transform
    g.setAttribute('transform', `translate(${sim.pan.x},${sim.pan.y}) scale(${sim.scale})`)

    // Update edges
    for (let i = 0; i < edges.length; i++) {
      const path = g.querySelector(`#edge-${i}`) as SVGPathElement | null
      if (!path) continue
      const src = sim.nodeMap.get(edges[i].source)
      const tgt = sim.nodeMap.get(edges[i].target)
      if (!src || !tgt) continue

      // Curved edge — offset perpendicular to midpoint
      const mx = (src.x + tgt.x) / 2
      const my = (src.y + tgt.y) / 2
      const dx = tgt.x - src.x
      const dy = tgt.y - src.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 1
      const offset = Math.min(dist * 0.15, 25)
      const nx = -dy / dist * offset
      const ny = dx / dist * offset

      path.setAttribute('d', `M${src.x},${src.y} Q${mx + nx},${my + ny} ${tgt.x},${tgt.y}`)

      // Highlight if connected to selected
      const sel = sim.selected
      const connected = sel && (edges[i].source === sel || edges[i].target === sel)
      path.setAttribute('stroke', connected ? getColor(src.type) : 'rgba(148, 163, 184, 0.15)')
      path.setAttribute('stroke-width', connected ? '1.5' : '0.8')
      path.setAttribute('opacity', sel && !connected ? '0.3' : '1')
    }

    // Update nodes
    for (const node of sim.nodes) {
      const group = g.querySelector(`[data-nid="${node.id}"]`) as SVGGElement | null
      if (!group) continue

      group.setAttribute('transform', `translate(${node.x},${node.y})`)

      const circle = group.querySelector('circle')
      const text = group.querySelector('text')
      const sel = sim.selected
      const isSelected = sel === node.id
      const isConnected = sel ? edges.some(e => (e.source === sel && e.target === node.id) || (e.target === sel && e.source === node.id)) : false
      const dimmed = sel && !isSelected && !isConnected

      const radius = 4 + Math.min(node.edges * 1.5, 8)
      if (circle) {
        circle.setAttribute('r', String(isSelected ? radius + 2 : sim.hovered === node.id ? radius + 1 : radius))
        circle.setAttribute('fill', getColor(node.type))
        circle.setAttribute('opacity', dimmed ? '0.2' : '1')
        circle.setAttribute('filter', isSelected ? 'url(#glow)' : '')
      }
      if (text) {
        text.setAttribute('y', String(radius + 14))
        text.setAttribute('opacity', dimmed ? '0.15' : '0.85')
      }
    }
  }, [edges])

  // Animation loop
  const loop = useCallback(() => {
    const sim = simRef.current
    if (!sim.running) return

    tick()
    render()

    if (sim.alpha > 0.001 || sim.drag) {
      sim.rafId = requestAnimationFrame(loop)
    } else {
      sim.running = false
    }
  }, [tick, render])

  const startSim = useCallback(() => {
    const sim = simRef.current
    if (sim.running) return
    sim.running = true
    sim.rafId = requestAnimationFrame(loop)
  }, [loop])

  // Initialize on data change
  useEffect(() => {
    if (nodes.length === 0) return

    // Measure container FIRST so buildSim positions nodes correctly
    const svg = svgRef.current
    if (svg) {
      const rect = svg.getBoundingClientRect()
      simRef.current.width = rect.width || 800
      simRef.current.height = rect.height || height
    }

    buildSim()

    // buildSim triggers setRenderKey which creates SVG elements on next render.
    // Start simulation after React re-renders to create the DOM nodes.
    const timer = setTimeout(() => {
      startSim()
    }, 80)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(simRef.current.rafId)
      simRef.current.running = false
    }
  }, [nodes, edges, height, buildSim, startSim])

  // Mouse handlers — all work on the SVG coordinate space
  const getPoint = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const sim = simRef.current
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - sim.pan.x) / sim.scale,
      y: (e.clientY - rect.top - sim.pan.y) / sim.scale,
    }
  }, [])

  const findNode = useCallback((x: number, y: number): SimNode | null => {
    const sim = simRef.current
    for (let i = sim.nodes.length - 1; i >= 0; i--) {
      const n = sim.nodes[i]
      const r = 4 + Math.min(n.edges * 1.5, 8) + 4 // hit area padding
      const dx = x - n.x
      const dy = y - n.y
      if (dx * dx + dy * dy < r * r) return n
    }
    return null
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pt = getPoint(e)
    const node = findNode(pt.x, pt.y)

    if (node) {
      // Start dragging node
      simRef.current.drag = { node, offsetX: pt.x - node.x, offsetY: pt.y - node.y }
      node.pinned = true
      simRef.current.alpha = 0.3
      startSim()
    } else {
      // Start panning
      const sim = simRef.current
      sim.panning = { startX: e.clientX, startY: e.clientY, panX: sim.pan.x, panY: sim.pan.y }
    }
  }, [getPoint, findNode, startSim])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const sim = simRef.current

    if (sim.drag) {
      const pt = getPoint(e)
      sim.drag.node.x = pt.x - sim.drag.offsetX
      sim.drag.node.y = pt.y - sim.drag.offsetY
      sim.drag.node.vx = 0
      sim.drag.node.vy = 0
      render()
    } else if (sim.panning) {
      sim.pan.x = sim.panning.panX + (e.clientX - sim.panning.startX)
      sim.pan.y = sim.panning.panY + (e.clientY - sim.panning.startY)
      render()
    } else {
      // Hover detection
      const pt = getPoint(e)
      const node = findNode(pt.x, pt.y)
      const newHovered = node?.id ?? null
      if (newHovered !== sim.hovered) {
        sim.hovered = newHovered
        render()
      }
    }
  }, [getPoint, findNode, render])

  const handleMouseUp = useCallback(() => {
    const sim = simRef.current
    if (sim.drag) {
      sim.drag.node.pinned = false
      sim.drag = null
      sim.alpha = 0.1
      startSim()
    }
    sim.panning = null
  }, [startSim])

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Only fire on mouseup without drag
    const sim = simRef.current
    const pt = getPoint(e)
    const node = findNode(pt.x, pt.y)

    if (node) {
      sim.selected = sim.selected === node.id ? null : node.id
      render()
      if (onNodeClick) {
        onNodeClick({ id: node.id, label: node.label, type: node.type, data: node.data })
      }
    } else {
      if (sim.selected) {
        sim.selected = null
        render()
      }
    }
  }, [getPoint, findNode, render, onNodeClick])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const sim = simRef.current
    const delta = e.deltaY > 0 ? 0.92 : 1.08
    sim.scale = Math.max(0.3, Math.min(3, sim.scale * delta))
    render()
  }, [render])

  const handleDoubleClick = useCallback(() => {
    const sim = simRef.current
    sim.pan = { x: 0, y: 0 }
    sim.scale = 1
    render()
  }, [render])

  // Read from ref each render — renderKey ensures we re-render after buildSim
  const simNodes = renderKey >= 0 ? simRef.current.nodes : []

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-400/[0.08] bg-[rgba(10,14,20,0.7)]" style={{ height }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Dot grid pattern */}
          <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.5" fill="rgba(148, 163, 184, 0.12)" />
          </pattern>
        </defs>

        {/* Background dot grid */}
        <rect width="100%" height="100%" fill="url(#dotgrid)" />

        <g id="graph-content">
          {/* Edges */}
          {edges.map((_, i) => (
            <path
              key={`e-${i}`}
              id={`edge-${i}`}
              fill="none"
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth="0.8"
            />
          ))}

          {/* Nodes */}
          {simNodes.map((node) => {
            const radius = 4 + Math.min(node.edges * 1.5, 8)
            return (
              <g key={node.id} data-nid={node.id}>
                <circle
                  r={radius}
                  fill={getColor(node.type)}
                  opacity={1}
                />
                <text
                  y={radius + 14}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="14"
                  fontFamily="var(--font-dm-sans), system-ui, sans-serif"
                  opacity={0.85}
                  style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                >
                  {truncate(node.label, 16)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 text-sm text-slate-400">
        {[
          { type: 'Person', color: '#6b8fc9' },
          { type: 'Organization', color: '#4ba383' },
          { type: 'Topic', color: '#c4934a' },
        ].map(({ type, color }) => (
          <div key={type} className="flex items-center gap-1">
            <div className="size-1.5 rounded-full" style={{ background: color }} />
            {type}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="absolute bottom-3 right-3 text-sm text-slate-600">
        {nodes.length} nodes · {edges.length} edges
      </div>
    </div>
  )
}

export default GraphViewer

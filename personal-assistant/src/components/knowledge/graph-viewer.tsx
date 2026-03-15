'use client'

import React, { useState, useEffect, useRef } from 'react'

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
  width?: number
}

interface SimulatedNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

interface SimulatedEdge extends GraphEdge {
  sourceNode?: SimulatedNode
  targetNode?: SimulatedNode
}

const GraphViewer: React.FC<Props> = ({
  nodes,
  edges,
  onNodeClick,
  height = 600,
  width = 1000,
}) => {
  const canvasRef = useRef<SVGSVGElement>(null)
  const [simulatedNodes, setSimulatedNodes] = useState<SimulatedNode[]>([])
  const [simulatedEdges, setSimulatedEdges] = useState<SimulatedEdge[]>([])
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const animationRef = useRef<number | null>(null)
  const dragRef = useRef<{ startX: number; startY: number } | null>(null)

  // Color mapping for node types
  const getNodeColor = (type: 'Person' | 'Organization' | 'Topic'): string => {
    switch (type) {
      case 'Person':
        return '#3b82f6' // blue
      case 'Organization':
        return '#10b981' // green
      case 'Topic':
        return '#f97316' // orange
    }
  }

  // Initialize nodes with random positions
  useEffect(() => {
    const initialized = nodes.map((node) => ({
      ...node,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
    }))
    setSimulatedNodes(initialized)

    // Map edges to include node references
    const mapped = edges.map((edge) => ({
      ...edge,
      sourceNode: initialized.find((n) => n.id === edge.source),
      targetNode: initialized.find((n) => n.id === edge.target),
    }))
    setSimulatedEdges(mapped)
  }, [nodes, edges, width, height])

  // Physics simulation
  useEffect(() => {
    const simulate = () => {
      setSimulatedNodes((prevNodes) => {
        const updated = prevNodes.map((node) => ({ ...node }))

        // Apply forces
        for (let i = 0; i < updated.length; i++) {
          let fx = 0
          let fy = 0

          // Repulsion from other nodes (coulomb force)
          for (let j = 0; j < updated.length; j++) {
            if (i !== j) {
              const dx = updated[j].x - updated[i].x
              const dy = updated[j].y - updated[i].y
              const distSq = dx * dx + dy * dy + 100
              const distance = Math.sqrt(distSq)

              // Repulsive force
              const force = -50 / distSq
              fx += (force * dx) / distance
              fy += (force * dy) / distance
            }
          }

          // Attraction to connected nodes (spring force)
          simulatedEdges.forEach((edge) => {
            let target: SimulatedNode | undefined
            if (edge.source === updated[i].id) {
              target = updated.find((n) => n.id === edge.target)
            } else if (edge.target === updated[i].id) {
              target = updated.find((n) => n.id === edge.source)
            }

            if (target) {
              const dx = target.x - updated[i].x
              const dy = target.y - updated[i].y
              const distance = Math.sqrt(dx * dx + dy * dy) + 1
              const force = distance * 0.1 // spring constant

              fx += force * (dx / distance)
              fy += force * (dy / distance)
            }
          })

          // Damping and velocity update
          updated[i].vx = (updated[i].vx + fx) * 0.85
          updated[i].vy = (updated[i].vy + fy) * 0.85

          // Position update with bounds checking
          updated[i].x += updated[i].vx
          updated[i].y += updated[i].vy

          // Keep within bounds
          updated[i].x = Math.max(20, Math.min(width - 20, updated[i].x))
          updated[i].y = Math.max(20, Math.min(height - 20, updated[i].y))
        }

        return updated
      })

      animationRef.current = requestAnimationFrame(simulate)
    }

    animationRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [simulatedEdges, width, height])

  // Handle mouse wheel for zoom
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.max(0.1, Math.min(5, s * delta)))
  }

  // Handle mouse down for pan
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.metaKey || e.ctrlKey) {
      dragRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y }
    }
  }

  // Handle mouse move for pan
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      setPan({
        x: e.clientX - dragRef.current.startX,
        y: e.clientY - dragRef.current.startY,
      })
    }
  }

  // Handle mouse up
  const handleMouseUp = () => {
    dragRef.current = null
  }

  // Node click handler
  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node)
    onNodeClick?.(node)
  }

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '12px',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    overflow: 'hidden',
  }

  const svgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    cursor: dragRef.current ? 'grabbing' : 'grab',
    backgroundColor: 'transparent',
  }

  const legendStyle: React.CSSProperties = {
    position: 'absolute',
    top: '12px',
    left: '12px',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    color: '#cbd5e1',
    zIndex: 10,
  }

  const legendItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  }

  const legendColorStyle = (color: string): React.CSSProperties => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: color,
  })

  const detailsPanelStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    padding: '16px',
    maxWidth: '300px',
    color: '#e2e8f0',
    fontSize: '12px',
    zIndex: 10,
  }

  const closeBtnStyle: React.CSSProperties = {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '16px',
  }

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '4px',
    padding: '6px 10px',
    fontSize: '11px',
    color: '#cbd5e1',
    pointerEvents: 'none',
    zIndex: 5,
  }

  return (
    <div style={containerStyle}>
      <svg
        ref={canvasRef}
        style={svgStyle}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
          {/* Draw edges */}
          {simulatedEdges.map((edge, idx) => {
            if (!edge.sourceNode || !edge.targetNode) return null
            const isHovered = hoveredEdge === `${edge.source}-${edge.target}`

            return (
              <g key={`edge-${idx}`}>
                <line
                  x1={edge.sourceNode.x}
                  y1={edge.sourceNode.y}
                  x2={edge.targetNode.x}
                  y2={edge.targetNode.y}
                  stroke={isHovered ? '#60a5fa' : 'rgba(148, 163, 184, 0.3)'}
                  strokeWidth={isHovered ? 2 : 1}
                  onMouseEnter={() => setHoveredEdge(`${edge.source}-${edge.target}`)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  style={{ transition: 'stroke 0.2s ease' }}
                />

                {/* Edge label */}
                {edge.label && isHovered && (
                  <text
                    x={(edge.sourceNode.x + edge.targetNode.x) / 2}
                    y={(edge.sourceNode.y + edge.targetNode.y) / 2}
                    fill="#94a3b8"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Draw nodes */}
          {simulatedNodes.map((node) => {
            const isSelected = selectedNode?.id === node.id
            const isHovered2 = hoveredNode === node.id
            const radius = isSelected ? 8 : isHovered2 ? 6 : 5
            const color = getNodeColor(node.type)

            return (
              <g key={`node-${node.id}`}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius}
                  fill={color}
                  opacity={isSelected ? 1 : isHovered2 ? 0.9 : 0.7}
                  onClick={() => handleNodeClick(node)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    filter: isSelected ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' : 'none',
                  }}
                />

                {/* Node label on hover */}
                {isHovered2 && (
                  <text
                    x={node.x}
                    y={node.y - radius - 8}
                    fill="#cbd5e1"
                    fontSize="12"
                    textAnchor="middle"
                    pointerEvents="none"
                    fontWeight="bold"
                  >
                    {node.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div style={legendStyle}>
        <div style={legendItemStyle}>
          <div style={legendColorStyle('#3b82f6')} />
          <span>Person</span>
        </div>
        <div style={legendItemStyle}>
          <div style={legendColorStyle('#10b981')} />
          <span>Organization</span>
        </div>
        <div style={legendItemStyle}>
          <div style={legendColorStyle('#f97316')} />
          <span>Topic</span>
        </div>
      </div>

      {/* Details panel */}
      {selectedNode && (
        <div style={detailsPanelStyle}>
          <button style={closeBtnStyle} onClick={() => setSelectedNode(null)}>
            ×
          </button>
          <div style={{ paddingRight: '20px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#f1f5f9' }}>
              {selectedNode.label}
            </div>
            <div style={{ marginBottom: '8px', color: '#94a3b8' }}>
              Type: <span style={{ color: '#cbd5e1' }}>{selectedNode.type}</span>
            </div>
            {selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
              <div>
                <div style={{ marginBottom: '4px', color: '#94a3b8' }}>Details:</div>
                <pre
                  style={{
                    fontSize: '10px',
                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                    padding: '6px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    maxHeight: '200px',
                    color: '#cbd5e1',
                  }}
                >
                  {JSON.stringify(selectedNode.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GraphViewer

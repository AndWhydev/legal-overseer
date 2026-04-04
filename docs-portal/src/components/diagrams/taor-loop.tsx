'use client'

import { useState, useEffect } from 'react'

const PHASES = [
  { name: 'Think', description: 'Pre-flight checks, model routing, context assembly' },
  { name: 'Act', description: 'Tool planning, batch execution, streaming' },
  { name: 'Observe', description: 'Collect results, evaluate quality, detect issues' },
  { name: 'Repeat', description: 'Model decides whether to continue or conclude' },
]

export function TAORLoop() {
  const [active, setActive] = useState(0)
  const [animating, setAnimating] = useState(true)

  useEffect(() => {
    if (!animating) return
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % 4)
    }, 2000)
    return () => clearInterval(timer)
  }, [animating])

  const size = 320
  const cx = size / 2
  const cy = size / 2
  const radius = 110
  const nodeR = 28
  const centerR = 32

  // Nodes positioned at 12, 3, 6, 9 o'clock
  const nodes = PHASES.map((phase, i) => {
    const angle = (i * 90 - 90) * Math.PI / 180
    return {
      ...phase,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  // Draw arc from previous active to current active (trailing indicator)
  const prevActive = (active + 3) % 4
  const arcStart = (prevActive * 90 - 90) * Math.PI / 180
  const arcEnd = (active * 90 - 90) * Math.PI / 180

  const arcPath = (() => {
    const x1 = cx + (radius) * Math.cos(arcStart)
    const y1 = cy + (radius) * Math.sin(arcStart)
    const x2 = cx + (radius) * Math.cos(arcEnd)
    const y2 = cy + (radius) * Math.sin(arcEnd)
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`
  })()

  return (
    <figure style={{
      margin: '2rem auto',
      padding: '2rem',
      textAlign: 'center',
      maxWidth: '480px',
    }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }}
      >
        {/* Dashed circle track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgb(230, 230, 228)"
          strokeWidth="1"
          strokeDasharray="6 4"
        />

        {/* Active arc (trails behind the active node) */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgb(23, 23, 23)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transition: 'all 0.6s ease' }}
        />

        {/* Center label */}
        <circle cx={cx} cy={cy} r={centerR} fill="rgb(23, 23, 23)" />
        <text
          x={cx} y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="12"
          fontWeight="500"
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.02em"
        >
          TAOR
        </text>

        {/* Phase nodes */}
        {nodes.map((node, i) => {
          const isActive = active === i
          return (
            <g
              key={node.name}
              onClick={() => { setAnimating(false); setActive(i) }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={node.x} cy={node.y} r={nodeR}
                fill={isActive ? 'rgb(23, 23, 23)' : '#faf9f5'}
                stroke={isActive ? 'rgb(23, 23, 23)' : 'rgb(200, 200, 198)'}
                strokeWidth={isActive ? 0 : 1.5}
                style={{ transition: 'all 0.3s ease' }}
              />
              <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="500"
                fill={isActive ? 'white' : 'rgb(23, 23, 23)'}
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="-0.01em"
                style={{ transition: 'fill 0.3s ease' }}
              >
                {node.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Description */}
      <div style={{
        marginTop: '1.25rem',
        padding: '0.75rem 1rem',
        background: 'rgba(238, 238, 230, 0.4)',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'rgb(80, 80, 80)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        transition: 'all 0.3s ease',
        lineHeight: '1.5',
      }}>
        <strong style={{ color: 'rgb(23, 23, 23)' }}>
          {PHASES[active].name}
        </strong>
        {PHASES[active].description}
      </div>

      <button
        onClick={() => setAnimating(!animating)}
        aria-label={animating ? 'Pause animation' : 'Play animation'}
        style={{
          marginTop: '0.75rem',
          padding: '0.375rem 1rem',
          fontSize: '12px',
          background: 'transparent',
          border: '1px solid rgb(222, 222, 220)',
          borderRadius: '6px',
          cursor: 'pointer',
          color: 'rgb(140, 140, 140)',
          fontFamily: 'inherit',
          letterSpacing: '0.01em',
        }}
      >
        {animating ? 'Pause' : 'Play'}
      </button>
    </figure>
  )
}

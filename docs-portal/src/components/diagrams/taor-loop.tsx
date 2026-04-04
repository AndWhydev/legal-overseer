'use client'

import { useState } from 'react'

const PHASES = [
  { name: 'Think', description: 'Pre-flight checks, model routing, context assembly' },
  { name: 'Act', description: 'Tool planning, batch execution, streaming' },
  { name: 'Observe', description: 'Collect results, evaluate quality, detect issues' },
  { name: 'Repeat', description: 'Model decides whether to continue or conclude' },
]

export function TAORLoop() {
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)

  const size = 320
  const cx = size / 2
  const cy = size / 2
  const radius = 110
  const nodeR = 28
  const centerR = 30

  const nodes = PHASES.map((phase, i) => {
    const angle = (i * 90 - 90) * Math.PI / 180
    return {
      ...phase,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  // Arc length = quarter circle for the spinner
  const arcLen = Math.PI * radius / 2
  const circumference = 2 * Math.PI * radius

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
        {/* Dashed track circle */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgb(235, 235, 232)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />

        {/* Spinning arc — smooth continuous rotation */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgb(23, 23, 23)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          strokeDashoffset={arcLen / 2}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: paused ? 'none' : 'taor-spin 8s linear infinite',
          }}
        />

        {/* Center label */}
        <circle cx={cx} cy={cy} r={centerR} fill="rgb(23, 23, 23)" />
        <text
          x={cx} y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="500"
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="-0.02em"
        >
          TAOR
        </text>

        {/* Phase nodes */}
        {nodes.map((node, i) => {
          const isHovered = hovered === i
          return (
            <g
              key={node.name}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={node.x} cy={node.y} r={isHovered ? nodeR + 2 : nodeR}
                fill={isHovered ? 'rgb(23, 23, 23)' : '#faf9f5'}
                stroke={isHovered ? 'rgb(23, 23, 23)' : 'rgb(210, 210, 208)'}
                strokeWidth={isHovered ? 0 : 1.5}
                style={{ transition: 'all 0.2s ease' }}
              />
              <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="500"
                fill={isHovered ? 'white' : 'rgb(23, 23, 23)'}
                fontFamily="Inter, system-ui, sans-serif"
                letterSpacing="-0.01em"
                style={{ transition: 'fill 0.2s ease', pointerEvents: 'none' }}
              >
                {node.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Description on hover */}
      {hovered !== null && (
        <div style={{
          marginTop: '1rem',
          padding: '0.625rem 1rem',
          background: 'rgba(238, 238, 230, 0.4)',
          borderRadius: '8px',
          fontSize: '14px',
          color: 'rgb(80, 80, 80)',
          lineHeight: '1.5',
        }}>
          <strong style={{ color: 'rgb(23, 23, 23)' }}>{PHASES[hovered].name}</strong>{' '}
          {PHASES[hovered].description}
        </div>
      )}

      <button
        onClick={() => setPaused(!paused)}
        aria-label={paused ? 'Play animation' : 'Pause animation'}
        style={{
          marginTop: '1rem',
          padding: '0.375rem 1rem',
          fontSize: '12px',
          background: 'transparent',
          border: '1px solid rgb(222, 222, 220)',
          borderRadius: '6px',
          cursor: 'pointer',
          color: 'rgb(140, 140, 140)',
          fontFamily: 'inherit',
        }}
      >
        {paused ? 'Play' : 'Pause'}
      </button>

      {/* CSS animation */}
      <style>{`
        @keyframes taor-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </figure>
  )
}

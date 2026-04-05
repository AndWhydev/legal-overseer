'use client'

import { useState, useEffect, useRef } from 'react'

const PHASES = [
  { name: 'Think', description: 'Pre-flight checks, model routing, context assembly' },
  { name: 'Act', description: 'Tool planning, batch execution, streaming' },
  { name: 'Observe', description: 'Collect results, evaluate quality, detect issues' },
  { name: 'Repeat', description: 'Model decides whether to continue or conclude' },
]

export function TAORLoop() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  const size = 320
  const cx = size / 2
  const cy = size / 2
  const radius = 110
  const nodeR = 28
  const centerR = 30
  const duration = 8000 // 8s per full rotation

  // Node positions at 12, 3, 6, 9 o'clock
  const nodes = PHASES.map((phase, i) => {
    const angle = (i * 90 - 90) * Math.PI / 180
    return {
      ...phase,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angleDeg: i * 90, // 0, 90, 180, 270 degrees from top
    }
  })

  useEffect(() => {
    if (paused) return

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = (elapsed % duration) / duration // 0 to 1
      const currentAngle = progress * 360 // 0 to 360

      // Determine which node the arc center is closest to
      let closest = 0
      let minDist = 360
      for (let i = 0; i < 4; i++) {
        const nodeAngle = i * 90
        let dist = Math.abs(currentAngle - nodeAngle)
        if (dist > 180) dist = 360 - dist
        if (dist < minDist) {
          minDist = dist
          closest = i
        }
      }
      setActive(closest)

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused])

  // Arc: quarter circle that rotates with CSS
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
        {/* Dashed track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgb(235, 235, 232)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />

        {/* Spinning arc */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          strokeDashoffset={arcLen * 1.5}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: paused ? 'none' : `taor-spin ${duration}ms linear infinite`,
          }}
        />

        {/* Center */}
        <circle cx={cx} cy={cy} r={centerR} fill="var(--text-primary)" />
        <text
          x={cx} y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="500"
          fill="white"
          fontFamily="Inter, system-ui, sans-serif"
        >
          TAOR
        </text>

        {/* Phase nodes - active one fills black */}
        {nodes.map((node, i) => {
          const isActive = active === i
          return (
            <g key={node.name} style={{ cursor: 'pointer' }} onClick={() => setPaused(!paused)}>
              <circle
                cx={node.x} cy={node.y} r={nodeR}
                fill={isActive ? 'var(--text-primary)' : '#fff'}
                stroke={isActive ? 'var(--text-primary)' : 'rgb(210, 210, 208)'}
                strokeWidth={isActive ? 0 : 1.5}
                style={{ transition: 'all 0.25s ease' }}
              />
              <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="12"
                fontWeight="500"
                fill={isActive ? 'white' : 'var(--text-primary)'}
                fontFamily="Inter, system-ui, sans-serif"
                style={{ transition: 'fill 0.25s ease', pointerEvents: 'none' }}
              >
                {node.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Active phase description */}
      <div style={{
        marginTop: '1rem',
        padding: '0.625rem 1rem',
        background: 'var(--code-bg)',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'var(--text-muted)',
        lineHeight: '1.5',
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>{PHASES[active].name}</strong>
        {PHASES[active].description}
      </div>

      <button
        onClick={() => setPaused(!paused)}
        aria-label={paused ? 'Play' : 'Pause'}
        style={{
          marginTop: '0.75rem',
          padding: '0.375rem 1rem',
          fontSize: '12px',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          cursor: 'pointer',
          color: 'var(--text-faint)',
          fontFamily: 'inherit',
        }}
      >
        {paused ? 'Play' : 'Pause'}
      </button>

      <style>{`
        @keyframes taor-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </figure>
  )
}

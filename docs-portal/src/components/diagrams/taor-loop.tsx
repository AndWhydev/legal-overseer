'use client'

import { useState, useEffect } from 'react'

const PHASES = [
  { name: 'Think', description: 'Pre-flight checks, model routing, context assembly', angle: 0, color: 'rgb(23, 23, 23)' },
  { name: 'Act', description: 'Tool planning, batch execution, streaming', angle: 90, color: 'rgb(80, 80, 80)' },
  { name: 'Observe', description: 'Collect results, evaluate quality, detect issues', angle: 180, color: 'rgb(120, 120, 120)' },
  { name: 'Repeat', description: 'Model decides: continue, iterate, or conclude', angle: 270, color: 'rgb(160, 160, 160)' },
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

  const radius = 80
  const cx = 120
  const cy = 120

  return (
    <figure style={{
      margin: '2rem 0',
      padding: '1.5rem',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
      textAlign: 'center',
    }}>
      <svg width="240" height="240" viewBox="0 0 240 240" style={{ maxWidth: '100%' }}>
        {/* Center circle */}
        <circle cx={cx} cy={cy} r="24" fill="var(--bg-code)" stroke="var(--border-strong)" strokeWidth="1.5" />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-primary)" fontFamily="Inter, system-ui">TAOR</text>

        {/* Connecting arcs */}
        {PHASES.map((_, i) => {
          const startAngle = (i * 90 - 45) * Math.PI / 180
          const endAngle = (i * 90 + 45) * Math.PI / 180
          const x1 = cx + (radius - 15) * Math.cos(startAngle)
          const y1 = cy + (radius - 15) * Math.sin(startAngle)
          const x2 = cx + (radius - 15) * Math.cos(endAngle)
          const y2 = cy + (radius - 15) * Math.sin(endAngle)
          return (
            <path
              key={`arc-${i}`}
              d={`M ${x1} ${y1} A ${radius - 15} ${radius - 15} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={active === i ? 'rgb(23, 23, 23)' : 'rgb(222, 222, 222)'}
              strokeWidth={active === i ? 2.5 : 1}
              strokeDasharray={active === i ? 'none' : '4 4'}
              style={{ transition: 'all 0.5s ease' }}
            />
          )
        })}

        {/* Phase nodes */}
        {PHASES.map((phase, i) => {
          const angle = (i * 90 - 90) * Math.PI / 180
          const x = cx + radius * Math.cos(angle)
          const y = cy + radius * Math.sin(angle)
          const isActive = active === i
          return (
            <g key={phase.name} 
               onClick={() => { setAnimating(false); setActive(i) }}
               style={{ cursor: 'pointer' }}>
              <circle
                cx={x} cy={y} r={isActive ? 22 : 18}
                fill={isActive ? 'rgb(23, 23, 23)' : 'white'}
                stroke={isActive ? 'rgb(23, 23, 23)' : 'rgb(180, 180, 180)'}
                strokeWidth={isActive ? 2 : 1.5}
                style={{ transition: 'all 0.3s ease' }}
              />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="600"
                fill={isActive ? 'white' : 'var(--text-primary)'} fontFamily="Inter, system-ui"
                style={{ transition: 'fill 0.3s ease' }}>
                {phase.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Description */}
      <div style={{
        marginTop: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'var(--bg-code)',
        borderRadius: '6px',
        fontSize: '0.875rem',
        color: 'var(--text-secondary)',
        minHeight: '2.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease',
      }}>
        <strong style={{ color: 'rgb(23, 23, 23)', marginRight: '0.5rem' }}>
          {PHASES[active].name}:
        </strong>
        {PHASES[active].description}
      </div>

      <button
        onClick={() => setAnimating(!animating)}
        style={{
          marginTop: '0.5rem',
          padding: '0.25rem 0.75rem',
          fontSize: '0.75rem',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
        }}
      >
        {animating ? 'Pause' : 'Play'} animation
      </button>
    </figure>
  )
}

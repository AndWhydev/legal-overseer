'use client'

import { useState } from 'react'

interface Layer {
  name: string
  description: string
  color: string
  icon: string
}

const LAYERS: Layer[] = [
  { name: 'Predictive + Procedural', description: 'Anticipate needs, trigger learned workflows', color: '#F0FDF4', icon: '🔮' },
  { name: 'Adaptive Query Routing', description: 'Right-size retrieval per query complexity', color: '#ECFDF5', icon: '🔀' },
  { name: 'Sleep Consolidation', description: 'Nightly summarize, resolve, discover, prune', color: '#F0F9FF', icon: '🌙' },
  { name: 'Contextual Retrieval', description: 'Enrich chunks at ingestion for precision', color: '#EFF6FF', icon: '🎯' },
  { name: 'Graph-Aware Retrieval', description: 'Relationship-aware proactive recall', color: '#F5F3FF', icon: '🕸️' },
  { name: 'Entity Graph Foundation', description: 'pgvector nodes, bi-temporal edges, SVO events', color: '#FEF3C7', icon: '📊' },
]

export function LayerStack() {
  const [activeLayer, setActiveLayer] = useState<number | null>(null)

  return (
    <div style={{ margin: '2rem 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {LAYERS.map((layer, i) => (
          <div
            key={layer.name}
            onMouseEnter={() => setActiveLayer(i)}
            onMouseLeave={() => setActiveLayer(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.875rem 1.25rem',
              background: activeLayer === i ? layer.color : 'var(--bg-surface)',
              border: `1px solid ${activeLayer === i ? 'var(--border-strong)' : 'var(--border-default)'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: activeLayer === i ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{layer.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                Layer {6 - i}: {layer.name}
              </div>
              <div style={{
                fontSize: '0.8125rem',
                color: 'var(--text-secondary)',
                marginTop: '0.125rem',
                maxHeight: activeLayer === i ? '100px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
                opacity: activeLayer === i ? 1 : 0,
              }}>
                {layer.description}
              </div>
            </div>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Phase {35 + (5 - i)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

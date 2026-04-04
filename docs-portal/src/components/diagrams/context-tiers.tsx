'use client'

import { useState } from 'react'

const TIERS = [
  { name: 'System Prompt', budget: '4K-12K', priority: 1, color: '#1C1C1C', textColor: 'white', description: 'Identity, guidelines, standing orders, connected channels' },
  { name: 'Pending Actions', budget: '0-800', priority: 2, color: '#374151', textColor: 'white', description: 'Approval queue items awaiting user confirmation' },
  { name: 'Recent Messages', budget: '1.2K-12K', priority: 3, color: '#6B7280', textColor: 'white', description: 'Verbatim conversation turns, newest preserved first' },
  { name: 'Retrieved Context', budget: '0-6K', priority: 4, color: '#9CA3AF', textColor: 'white', description: 'RAG results from Pinecone + graph search' },
  { name: 'Proactive Recall', budget: '0-1.5K', priority: 5, color: '#D1D5DB', textColor: '#1C1C1C', description: 'Graph-aware entity context, predictive loading' },
  { name: 'Compressed History', budget: '0-4K', priority: 6, color: '#E5E7EB', textColor: '#1C1C1C', description: 'Summarized older conversation turns' },
  { name: 'Key Facts', budget: '0-2K', priority: 7, color: '#F3F4F6', textColor: '#6B7280', description: 'Distilled factual assertions from summaries' },
]

export function ContextTiers() {
  const [activeTier, setActiveTier] = useState<number | null>(null)

  return (
    <figure style={{ margin: '2rem 0' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        maxWidth: '560px',
        margin: '0 auto',
      }}>
        {TIERS.map((tier, i) => {
          const width = 100 - i * 6
          return (
            <div
              key={tier.name}
              onMouseEnter={() => setActiveTier(i)}
              onMouseLeave={() => setActiveTier(null)}
              style={{
                width: `${width}%`,
                margin: '0 auto',
                padding: '0.625rem 1rem',
                background: tier.color,
                color: tier.textColor,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: activeTier === i ? 'scale(1.03)' : 'scale(1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8125rem',
              }}
            >
              <span style={{ fontWeight: 500 }}>{tier.name}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', opacity: 0.8 }}>
                {tier.budget} tokens
              </span>
            </div>
          )
        })}
      </div>

      {activeTier !== null && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-code)',
          borderRadius: '6px',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: '560px',
          margin: '1rem auto 0',
        }}>
          <strong>Priority {TIERS[activeTier].priority}:</strong> {TIERS[activeTier].description}
        </div>
      )}

      <div style={{
        textAlign: 'center',
        marginTop: '0.75rem',
        fontSize: '0.75rem',
        color: 'var(--text-tertiary)',
      }}>
        48,000 token total budget, allocated by priority
      </div>
    </figure>
  )
}

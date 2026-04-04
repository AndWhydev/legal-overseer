'use client'

import { ReactNode, Children, isValidElement, useState } from 'react'

export function CodeGroup({ children }: { children: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement)
  const [active, setActive] = useState(0)

  // Extract language from each child's props or className
  const languages = tabs.map((tab, i) => {
    const props = tab.props as Record<string, unknown>
    const className = (props.className as string) || ''
    const match = className.match(/language-(\w+)/)
    return match ? match[1] : props.title as string || `Tab ${i + 1}`
  })

  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '1.5rem 0',
    }}>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-page)',
      }}>
        {languages.map((lang, i) => (
          <button
            key={lang}
            onClick={() => setActive(i)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: active === i ? 600 : 400,
              color: active === i ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: active === i ? 'var(--bg-surface)' : 'transparent',
              border: 'none',
              borderBottom: active === i ? '2px solid var(--text-link)' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
              textTransform: 'capitalize',
            }}
          >
            {lang}
          </button>
        ))}
      </div>
      <div style={{ background: 'var(--bg-code)' }}>
        {tabs[active]}
      </div>
    </div>
  )
}

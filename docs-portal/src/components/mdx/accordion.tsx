'use client'

import { ReactNode, useState } from 'react'

export function Accordion({ title, children, defaultOpen = false }: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      margin: '1rem 0',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--bg-surface)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.9375rem',
          fontWeight: 500,
          color: 'var(--text-primary)',
          textAlign: 'left',
        }}
      >
        {title}
        <span style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease',
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)',
        }}>
          ▼
        </span>
      </button>
      {open && (
        <div style={{
          padding: '1rem',
          borderTop: '1px solid var(--border-default)',
          fontSize: '0.9375rem',
          lineHeight: 1.7,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

import { ReactNode } from 'react'

export function Param({ name, type, required, children }: {
  name: string
  type: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div style={{
      padding: '0.75rem 0',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
        <code style={{ fontWeight: 600, fontSize: '0.875rem' }}>{name}</code>
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {type}
        </span>
        {required && (
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: '#DC2626',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}>
            Required
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )
}

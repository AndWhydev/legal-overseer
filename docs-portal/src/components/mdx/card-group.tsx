import { ReactNode, Children, isValidElement } from 'react'
import Link from 'next/link'

export function CardGroup({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '1rem',
      margin: '1.5rem 0',
    }}>
      {children}
    </div>
  )
}

export function Card({ title, href, icon, children }: {
  title: string
  href?: string
  icon?: string
  children: ReactNode
}) {
  const content = (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      padding: '1.25rem',
      background: 'var(--bg-surface)',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      cursor: href ? 'pointer' : 'default',
      height: '100%',
    }}
    onMouseEnter={(e) => {
      if (href) {
        e.currentTarget.style.borderColor = 'var(--text-link)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'var(--border-default)'
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      {icon && <span style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'block' }}>{icon}</span>}
      <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.375rem', marginTop: 0, color: 'var(--text-primary)' }}>
        {title}
      </h4>
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</Link>
  }
  return content
}

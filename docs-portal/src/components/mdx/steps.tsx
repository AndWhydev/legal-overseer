import { ReactNode, Children, isValidElement } from 'react'

export function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement)
  return (
    <div style={{ margin: '1.5rem 0', position: 'relative' }}>
      {steps.map((child, i) => (
        <div key={i} style={{ display: 'flex', gap: '1rem', paddingBottom: i < steps.length - 1 ? '1.5rem' : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--text-primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8125rem',
              fontWeight: 600,
            }}>
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: '2px',
                flex: 1,
                background: 'var(--border-default)',
                marginTop: '0.5rem',
              }} />
            )}
          </div>
          <div style={{ flex: 1, paddingTop: '0.15rem' }}>{child}</div>
        </div>
      ))}
    </div>
  )
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', marginTop: 0 }}>{title}</h4>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>{children}</div>
    </div>
  )
}

import { ReactNode } from 'react'

type CalloutType = 'tip' | 'note' | 'warning'

const config: Record<CalloutType, { bg: string; border: string; icon: string; emoji: string }> = {
  tip: { bg: 'var(--callout-tip-bg)', border: 'var(--callout-tip-border)', icon: 'var(--callout-tip-icon)', emoji: '💡' },
  note: { bg: 'var(--callout-note-bg)', border: 'var(--callout-note-border)', icon: 'var(--callout-note-icon)', emoji: 'ℹ️' },
  warning: { bg: 'var(--callout-warning-bg)', border: 'var(--callout-warning-border)', icon: 'var(--callout-warning-icon)', emoji: '⚠️' },
}

export function Callout({ type = 'note', children }: { type?: CalloutType; children: ReactNode }) {
  const c = config[type]
  return (
    <div style={{
      background: c.bg,
      borderLeft: `3px solid ${c.border}`,
      borderRadius: '0 8px 8px 0',
      padding: '1rem 1.25rem',
      margin: '1.5rem 0',
      fontSize: '0.9375rem',
      lineHeight: 1.7,
    }}>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <span style={{ flexShrink: 0 }}>{c.emoji}</span>
        <div>{children}</div>
      </div>
    </div>
  )
}

export function Tip({ children }: { children: ReactNode }) {
  return <Callout type="tip">{children}</Callout>
}

export function Note({ children }: { children: ReactNode }) {
  return <Callout type="note">{children}</Callout>
}

export function Warning({ children }: { children: ReactNode }) {
  return <Callout type="warning">{children}</Callout>
}

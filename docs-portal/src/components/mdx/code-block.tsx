'use client'

import { useState } from 'react'

export function CodeBlock({ code, language, filename }: {
  code: string
  language?: string
  filename?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position: 'relative',
      border: '1px solid var(--border-default)',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '1.5rem 0',
    }}>
      {filename && (
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-page)',
          fontSize: '0.8125rem',
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--text-secondary)',
        }}>
          {filename}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <pre style={{
          background: 'var(--bg-code)',
          padding: '1rem',
          margin: 0,
          border: 'none',
          borderRadius: 0,
          overflowX: 'auto',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}>
          <code className={language ? `language-${language}` : ''}>{code}</code>
        </pre>
        <button
          onClick={copy}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

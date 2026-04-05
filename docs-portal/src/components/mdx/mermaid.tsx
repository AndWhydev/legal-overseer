'use client'

import { useEffect, useRef, useState } from 'react'

export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const trimmed = (chart ?? "").trim()
      if (!trimmed) {
        setError("Empty chart definition")
        return
      }

      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: 'neutral',
          fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif',
          themeVariables: {
            primaryColor: '#f3f4f6',
            primaryTextColor: '#171717',
            primaryBorderColor: '#e5e7eb',
            lineColor: '#6b7280',
            secondaryColor: '#ffffff',
            tertiaryColor: '#f9fafb',
            noteBkgColor: '#f3f4f6',
            noteTextColor: '#171717',
            noteBorderColor: '#d1d5db',
          },
        })

        const id = 'mermaid-' + Math.random().toString(36).slice(2, 9)

        const { svg: rendered } = await mermaid.render(id, trimmed)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('Mermaid render failed for chart:', trimmed.slice(0, 100), '\nError:', message)
          setError(message)
          setSvg(null)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart])

  return (
    <figure style={{
      margin: '24px 0',
      padding: '24px',
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      textAlign: 'center',
      overflowX: 'auto',
      minHeight: '120px',
      width: '100%',
      maxWidth: '100vw',
    }}>
      {svg ? (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ display: 'flex', justifyContent: 'center' }}
        />
      ) : error ? (
        <div style={{
          padding: '16px',
          background: 'var(--code-bg)',
          borderRadius: '8px',
          textAlign: 'left',
        }}>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            color: 'var(--text-faint)',
            fontWeight: 500,
          }}>
            Diagram source (render failed)
          </p>
          <pre style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: '21px',
            whiteSpace: 'pre-wrap',
            color: '#374151',
            background: 'none',
            padding: 0,
            fontFamily: 'SFMono-Regular, ui-monospace, Menlo, monospace',
          }}>
            {chart?.trim() ?? ""}
          </pre>
        </div>
      ) : (
        <div style={{
          padding: '24px',
          color: 'var(--text-faint)',
          fontSize: '13px',
        }}>
          Loading diagram...
        </div>
      )}
      {caption && (
        <figcaption style={{
          marginTop: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--text-tertiary)',
          fontStyle: 'italic',
        }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

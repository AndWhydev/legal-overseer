'use client'

import { useEffect, useRef, useState } from 'react'

export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'Inter, system-ui, sans-serif',
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

        const trimmed = (chart ?? "").trim()
        const id = 'mermaid-' + Math.random().toString(36).slice(2, 9)

        // Validate before rendering
        await mermaid.parse(trimmed)

        const { svg: rendered } = await mermaid.render(id, trimmed)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          console.warn('Mermaid render failed:', message)
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
            Diagram preview unavailable
          </p>
          <pre style={{
            margin: 0,
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            color: 'rgb(120, 120, 120)',
            background: 'none',
            padding: 0,
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

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
            primaryColor: '#F5F5F4',
            primaryTextColor: '#1C1C1C',
            primaryBorderColor: '#D4D4D4',
            lineColor: '#9CA3AF',
            secondaryColor: '#FAFAF9',
            tertiaryColor: '#F0FDF4',
            noteBkgColor: '#EFF6FF',
            noteTextColor: '#1C1C1C',
            noteBorderColor: '#93C5FD',
          },
        })

        const trimmed = chart.trim()
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
      background: '#faf9f5',
      border: '1px solid rgb(222, 222, 220)',
      borderRadius: '12px',
      textAlign: 'center',
      overflow: 'auto',
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
            color: 'rgb(140, 140, 140)',
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
            {chart.trim()}
          </pre>
        </div>
      ) : (
        <div style={{
          padding: '24px',
          color: 'rgb(140, 140, 140)',
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

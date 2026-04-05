'use client'

import { useEffect, useRef, useState } from 'react'

export function Mermaid({ chart, caption }: { chart?: string; caption?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Decode: chart may be base64-encoded to avoid MDX parsing issues
  const chartText = (() => {
    if (!chart) return ""
    try {
      // Try base64 decode first
      const decoded = atob(chart)
      // If it decodes to valid mermaid (starts with flowchart, sequenceDiagram, etc)
      if (/^(flowchart|sequenceDiagram|stateDiagram|graph |classDiagram|erDiagram|gantt|pie)/m.test(decoded)) {
        return decoded
      }
    } catch {}
    // Not base64, use as-is
    return chart
  })()

  useEffect(() => {
    let cancelled = false
    const trimmed = chartText.trim()
    if (!trimmed) { setError("Empty chart"); return }

    async function render() {
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
          },
        })
        const id = 'mermaid-' + Math.random().toString(36).slice(2, 9)
        const { svg: rendered } = await mermaid.render(id, trimmed)
        if (!cancelled) { setSvg(rendered); setError(null) }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('Mermaid error:', msg, '\nChart:', trimmed.slice(0, 100))
          setError(msg); setSvg(null)
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [chartText])

  return (
    <figure style={{ margin: '24px 0', padding: '24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', textAlign: 'center', overflowX: 'auto', minHeight: '120px' }}>
      {svg ? (
        <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'flex', justifyContent: 'center' }} />
      ) : error ? (
        <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', textAlign: 'left' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#9ca3af', fontWeight: 500 }}>Diagram render failed</p>
          <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', color: '#6b7280', background: 'none', padding: 0, fontFamily: 'SFMono-Regular, ui-monospace, monospace' }}>{chartText.trim()}</pre>
        </div>
      ) : (
        <div style={{ padding: '24px', color: '#9ca3af', fontSize: '13px' }}>Loading diagram...</div>
      )}
      {caption && <figcaption style={{ marginTop: '12px', fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>{caption}</figcaption>}
    </figure>
  )
}

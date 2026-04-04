'use client'

import { useEffect, useRef, useState } from 'react'

export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let cancelled = false
    
    async function render() {
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
      
      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
      try {
        const { svg: rendered } = await mermaid.render(id, chart.trim())
        if (!cancelled) setSvg(rendered)
      } catch (err) {
        console.warn('Mermaid render failed:', err)
        if (!cancelled) setSvg(`<pre style="color: red">Diagram render error</pre>`)
      }
    }
    
    render()
    return () => { cancelled = true }
  }, [chart])

  return (
    <figure style={{
      margin: '2rem 0',
      padding: '1.5rem',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
      textAlign: 'center',
      overflow: 'auto',
    }}>
      <div 
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ display: 'flex', justifyContent: 'center' }}
      />
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

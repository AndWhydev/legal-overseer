'use client'

import { useEffect, useState } from 'react'

interface TocItem {
  id: string
  text: string
  level: number
}

export function TableOfContents({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' }
    )

    headings.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <aside style={{
      width: 'var(--toc-width)',
      height: 'calc(100vh - var(--header-height))',
      position: 'sticky',
      top: 'var(--header-height)',
      overflowY: 'auto',
      padding: '1.5rem 1rem',
      flexShrink: 0,
    }}>
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-tertiary)',
        marginBottom: '0.75rem',
      }}>
        On this page
      </div>
      {headings.map(({ id, text, level }) => (
        <a
          key={id}
          href={`#${id}`}
          style={{
            display: 'block',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            padding: '0.2rem 0',
            paddingLeft: level === 3 ? '0.75rem' : '0',
            color: activeId === id ? 'var(--text-link)' : 'var(--text-secondary)',
            fontWeight: activeId === id ? 500 : 400,
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
        >
          {text}
        </a>
      ))}
    </aside>
  )
}

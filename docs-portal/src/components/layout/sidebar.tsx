'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
}

interface SidebarProps {
  navigation: { title: string; items: NavItem[] }[]
}

export function Sidebar({ navigation }: SidebarProps) {
  const pathname = usePathname()

  // Find which section contains the current page
  const activeSectionTitle = useMemo(() => {
    for (const section of navigation) {
      if (section.items.some(item => item.href === pathname)) {
        return section.title
      }
    }
    return ''
  }, [navigation, pathname])

  // Initialize expanded set with the active section
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeSectionTitle) initial.add(activeSectionTitle)
    return initial
  })

  // Always keep active section expanded
  const isExpanded = (title: string) => title === activeSectionTitle || expanded.has(title)

  const toggleSection = (title: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      height: 'calc(100vh - var(--header-height))',
      borderRight: '1px solid var(--border-default)',
      background: 'var(--bg-surface)',
      overflowY: 'auto',
      position: 'sticky',
      top: 'var(--header-height)',
      padding: '1.5rem 0',
      flexShrink: 0,
    }}>
      <nav>
        {navigation.map((section) => {
          const open = isExpanded(section.title)
          return (
            <div key={section.title} style={{ marginBottom: '0.25rem' }}>
              <button
                onClick={() => toggleSection(section.title)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '0.5rem 1.5rem',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-tertiary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {section.title}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    flexShrink: 0,
                  }}
                >
                  <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href || item.title}
                    href={item.href || '#'}
                    style={{
                      display: 'block',
                      padding: '0.375rem 1.5rem',
                      fontSize: '0.875rem',
                      color: isActive ? 'var(--text-link)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 500 : 400,
                      background: isActive ? 'var(--callout-warning-bg)' : 'transparent',
                      borderRight: isActive ? '2px solid var(--text-link)' : '2px solid transparent',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.title}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

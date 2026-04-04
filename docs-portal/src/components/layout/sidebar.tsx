'use client'

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
        {navigation.map((section) => (
          <div key={section.title} style={{ marginBottom: '1.5rem' }}>
            <div style={{
              padding: '0 1.5rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-tertiary)',
              marginBottom: '0.5rem',
            }}>
              {section.title}
            </div>
            {section.items.map((item) => {
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
        ))}
      </nav>
    </aside>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navigation } from '@/docs.config'

export function PrevNext() {
  const pathname = usePathname()
  
  // Flatten all nav items into ordered list
  const allPages = navigation.flatMap(s => s.items)
  const currentIndex = allPages.findIndex(p => p.href === pathname)
  
  const prev = currentIndex > 0 ? allPages[currentIndex - 1] : null
  const next = currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null
  
  if (!prev && !next) return null
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      borderTop: '1px solid var(--border-default)',
      marginTop: '3rem',
      paddingTop: '1.5rem',
    }}>
      {prev ? (
        <Link href={prev.href} style={{
          textDecoration: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Previous</span>
          <span style={{ color: 'var(--text-link)', fontWeight: 500 }}>{prev.title}</span>
        </Link>
      ) : <div />}
      {next ? (
        <Link href={next.href} style={{
          textDecoration: 'none',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          textAlign: 'right',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Next</span>
          <span style={{ color: 'var(--text-link)', fontWeight: 500 }}>{next.title}</span>
        </Link>
      ) : <div />}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navigation } from '@/docs.config'

export function Breadcrumbs() {
  const pathname = usePathname()
  
  // Find current page in navigation
  let sectionTitle = ''
  let pageTitle = ''
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href === pathname) {
        sectionTitle = section.title
        pageTitle = item.title
      }
    }
  }
  
  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      fontSize: '0.8125rem',
      color: 'var(--text-tertiary)',
      marginBottom: '0.75rem',
    }}>
      <Link href="/docs/overview" style={{ color: 'var(--text-tertiary)', textDecoration: 'none' }}>Docs</Link>
      {sectionTitle && (
        <>
          <span>/</span>
          <span>{sectionTitle}</span>
        </>
      )}
      {pageTitle && sectionTitle && (
        <>
          <span>/</span>
          <span style={{ color: 'var(--text-secondary)' }}>{pageTitle}</span>
        </>
      )}
    </nav>
  )
}

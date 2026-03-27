'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from '@/lib/styles/design-tokens'

/** Routes where the NavBar should NOT render */
const HIDDEN_PREFIXES = ['/dashboard', '/login', '/onboard', '/callback', '/chat']

export function NavBar() {
  const pathname = usePathname()

  // Hide on dashboard, auth, and app routes
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null
  }

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '12px 20px',
        background: 'rgba(10, 10, 15, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.borderSubtle}`,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: C.textPrimary,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            letterSpacing: '-0.01em',
          }}
        >
          BitBit
        </Link>

        {/* Nav Links */}
        <div
          style={{
            display: 'flex',
            gap: 28,
            alignItems: 'center',
          }}
        >
          <NavLink href="/industries/agencies">Industries</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
          <NavLink href="/case-study">Case Study</NavLink>

          <div style={{ display: 'flex', gap: 12, marginLeft: 4 }}>
            <Link
              href="/login"
              style={{
                height: 36,
                padding: '0 16px',
                borderRadius: 8,
                border: `1px solid ${C.borderHover}`,
                color: C.textPrimary,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                transition: 'all 200ms',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = C.borderHover
              }}
            >
              Log In
            </Link>
            <Link
              href="/onboard"
              style={{
                height: 36,
                padding: '0 16px',
                borderRadius: 8,
                background: C.textPrimary,
                color: '#0a0f1a',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                transition: 'all 200ms',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: C.textSecondary,
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: 500,
        transition: 'color 200ms',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = C.textPrimary
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = C.textSecondary
      }}
    >
      {children}
    </Link>
  )
}

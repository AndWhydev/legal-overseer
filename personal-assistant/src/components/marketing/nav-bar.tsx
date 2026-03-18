'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavBar() {
  const pathname = usePathname()
  const isLanding = pathname === '/'

  if (!isLanding) {
    return null
  }

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '16px 20px',
        background: 'rgba(10, 10, 15, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
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
            fontSize: '16px',
            fontWeight: 500,
            color: '#F1F5F9',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🤖</span>
          BitBit
        </Link>

        {/* Nav Links */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            alignItems: 'center',
          }}
        >
          <a
            href="#features"
            style={{
              color: '#94A3B8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'color 200ms',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#F1F5F9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94A3B8'
            }}
          >
            Features
          </a>
          <a
            href="#pricing"
            style={{
              color: '#94A3B8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'color 200ms',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#F1F5F9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94A3B8'
            }}
          >
            Pricing
          </a>
          <a
            href="/docs"
            style={{
              color: '#94A3B8',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'color 200ms',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#F1F5F9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#94A3B8'
            }}
          >
            Docs
          </a>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Link
              href="/login"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#F1F5F9',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 200ms',
                cursor: 'pointer',
                display: 'inline-block',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              Log In
            </Link>
            <Link
              href="/onboard"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#10b981',
                color: '#000',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 200ms',
                cursor: 'pointer',
                display: 'inline-block',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#059669'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#10b981'
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

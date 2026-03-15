import type { ReactNode, Metadata } from 'react'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: {
    default: 'BitBit - AI Operations Platform',
    template: '%s | BitBit',
  },
  description: 'Agentic AI operations platform for digital agencies. Automate leads, invoices, communications, and tenders with intelligent agents.',
  keywords: [
    'AI operations',
    'digital agency',
    'automation',
    'AI agents',
    'leads management',
    'invoice automation',
    'business automation',
    'operations platform',
  ],
  authors: [{ name: 'BitBit' }],
  creator: 'BitBit',
  publisher: 'BitBit',
  openGraph: {
    type: 'website',
    siteName: 'BitBit',
    title: 'BitBit - AI Operations Platform',
    description: 'Agentic AI operations platform for digital agencies. Automate leads, invoices, communications, and tenders.',
    locale: 'en_AU',
    url: 'https://bitbit.chat',
    images: [
      {
        url: 'https://bitbit.chat/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BitBit - AI Operations Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BitBit - AI Operations Platform',
    description: 'Agentic AI operations platform for digital agencies.',
    site: '@bitbitchat',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://bitbit.chat',
  },
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#0a0a0f',
      }}
    >
      {/* Navigation Bar */}
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
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#F1F5F9',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '24px' }}>🤖</span>
            BitBit
          </div>

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
              <a
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
              </a>
              <a
                href="/onboard"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#000',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
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
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* Footer Component */}
      <Footer />
    </div>
  )
}

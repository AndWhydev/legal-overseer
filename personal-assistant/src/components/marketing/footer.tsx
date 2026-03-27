'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/styles/design-tokens'

const FOOTER_LINKS = {
  product: [
    { name: 'Features', href: '/#features' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'For Agencies', href: '/industries/agencies' },
    { name: 'For Trades', href: '/industries/trades' },
    { name: 'For Professional Services', href: '/industries/professional-services' },
  ],
  company: [
    { name: 'About', href: '/about' },
    { name: 'Case Study', href: '/case-study' },
    { name: 'Blog', href: '/blog' },
    { name: 'Contact', href: 'mailto:support@bitbit.chat' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
}

export default function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail('')
      setTimeout(() => setSubscribed(false), 3000)
    }
  }

  return (
    <footer
      style={{
        background: '#0a0a0f',
        borderTop: `1px solid ${C.borderSubtle}`,
        padding: '60px 20px 40px',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Main Footer Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '48px',
            marginBottom: '60px',
          }}
        >
          {/* Product Column */}
          <FooterColumn title="Product" links={FOOTER_LINKS.product} />

          {/* Company Column */}
          <FooterColumn title="Company" links={FOOTER_LINKS.company} />

          {/* Legal Column */}
          <FooterColumn title="Legal" links={FOOTER_LINKS.legal} />

          {/* Newsletter Column */}
          <div>
            <h4
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: C.textPrimary,
                marginBottom: 20,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Stay Updated
            </h4>
            <p
              style={{
                fontSize: 14,
                color: C.textSecondary,
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              Get updates on new features and tips for AI operations.
            </p>
            <form onSubmit={handleSubscribe} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${C.borderHover}`,
                    color: C.textPrimary,
                    fontSize: 14,
                    transition: 'all 200ms',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = C.borderHover
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: C.textPrimary,
                    border: 'none',
                    color: '#0a0f1a',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}
                >
                  Subscribe
                </button>
              </div>
              {subscribed && (
                <p
                  style={{
                    fontSize: 14,
                    color: C.textSecondary,
                    margin: 0,
                  }}
                >
                  Thanks for subscribing!
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: `1px solid ${C.borderSubtle}`,
            paddingTop: 32,
            marginTop: 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 24,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 14,
                  color: C.textDim,
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                2026 BitBit. All rights reserved.
              </p>
              <p
                style={{
                  fontSize: 14,
                  color: C.textSecondary,
                  margin: 0,
                }}
              >
                Built in Australia
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: Array<{ name: string; href: string }>
}) {
  return (
    <div>
      <h4
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: C.textPrimary,
          marginBottom: 20,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {title}
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {links.map((link) => (
          <li key={link.name} style={{ marginBottom: 12 }}>
            <Link
              href={link.href}
              style={{
                fontSize: 14,
                color: C.textSecondary,
                textDecoration: 'none',
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
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

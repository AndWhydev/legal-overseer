'use client'

import React, { useState } from 'react'

const FOOTER_LINKS = {
  product: [
    { name: 'Features', href: '#features' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Security', href: '#' },
    { name: 'Roadmap', href: '#' },
  ],
  company: [
    { name: 'About', href: '#' },
    { name: 'Blog', href: '#' },
    { name: 'Careers', href: '#' },
    { name: 'Contact', href: '#' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Cookie Policy', href: '#' },
    { name: 'Compliance', href: '#' },
  ],
  connect: [
    { name: 'Twitter', icon: '𝕏', href: '#' },
    { name: 'GitHub', icon: '🐙', href: '#' },
    { name: 'LinkedIn', icon: '🔗', href: '#' },
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
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
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
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#F1F5F9',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Product
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {FOOTER_LINKS.product.map((link) => (
                <li key={link.name} style={{ marginBottom: '12px' }}>
                  <a
                    href={link.href}
                    style={{
                      fontSize: '13px',
                      color: '#94A3B8',
                      textDecoration: 'none',
                      transition: 'color 200ms',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#10b981'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#94A3B8'
                    }}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#F1F5F9',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.name} style={{ marginBottom: '12px' }}>
                  <a
                    href={link.href}
                    style={{
                      fontSize: '13px',
                      color: '#94A3B8',
                      textDecoration: 'none',
                      transition: 'color 200ms',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#10b981'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#94A3B8'
                    }}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#F1F5F9',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.name} style={{ marginBottom: '12px' }}>
                  <a
                    href={link.href}
                    style={{
                      fontSize: '13px',
                      color: '#94A3B8',
                      textDecoration: 'none',
                      transition: 'color 200ms',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#10b981'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#94A3B8'
                    }}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter Column */}
          <div>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#F1F5F9',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Connect
            </h4>
            <p
              style={{
                fontSize: '13px',
                color: '#94A3B8',
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              Get updates on new features and tips for AI operations.
            </p>
            <form onSubmit={handleSubscribe} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginBottom: '8px',
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
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#F1F5F9',
                    fontSize: '13px',
                    transition: 'all 200ms',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#10b981',
                    border: 'none',
                    color: '#000',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#059669'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#10b981'
                  }}
                >
                  Subscribe
                </button>
              </div>
              {subscribed && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#10b981',
                    margin: 0,
                  }}
                >
                  Thanks for subscribing!
                </p>
              )}
            </form>

            {/* Social Links */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '16px',
              }}
            >
              {FOOTER_LINKS.connect.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  title={link.name}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    textDecoration: 'none',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            paddingTop: '32px',
            marginTop: '32px',
          }}
        >
          {/* Bottom Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '24px',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: '13px',
                  color: '#475569',
                  margin: 0,
                  marginBottom: '8px',
                }}
              >
                © 2026 BitBit. All rights reserved.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: '#94A3B8',
                }}
              >
                <span>🇦🇺</span>
                <span>Built in Australia</span>
              </div>
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              Made with 💚 for operations teams
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

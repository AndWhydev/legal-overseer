'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PortalBranding } from '@/lib/portal/types'
import { PortalNotificationBell } from './portal-notification-bell'

interface PortalShellProps {
  branding: PortalBranding | null
  orgName: string
  contactName: string
  orgSlug: string
  accessId: string
  children: React.ReactNode
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '', icon: DashboardIcon },
  { label: 'Projects', path: '/projects', icon: ProjectsIcon },
  { label: 'Invoices', path: '/invoices', icon: InvoicesIcon },
  { label: 'Files', path: '/files', icon: FilesIcon },
  { label: 'Requests', path: '/requests', icon: RequestsIcon },
]

export function PortalShell({ branding, orgName, contactName, orgSlug, accessId, children }: PortalShellProps) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const primaryColor = branding?.primary_color ?? '#2563EB'
  const accentColor = branding?.accent_color ?? '#3B82F6'
  const bgColor = branding?.background_color ?? 'var(--background)'
  const companyName = branding?.company_name ?? orgName
  const basePath = `/portal/${orgSlug}`

  const initials = contactName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{ minHeight: '100vh', background: bgColor, fontFamily: branding?.font_family ?? 'Inter, system-ui, sans-serif' }}>
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">

        <div className="flex items-center justify-between" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 64 }}>
          {/* Left: Logo + Company Name */}
          <Link href={basePath} className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={companyName} style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
            ) : (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--card)',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {companyName.charAt(0)}
              </div>
            )}
            <span className="text-base font-medium tracking-tight text-gray-900">
              {companyName}
            </span>
          </Link>

          {/* Center: Navigation (desktop) */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const itemPath = `${basePath}${item.path}`
              const isActive = item.path === ''
                ? pathname === basePath || pathname === `${basePath}/`
                : pathname.startsWith(itemPath)

              return (
                <Link
                  key={item.path}
                  href={itemPath}
                  className="flex items-center gap-2"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? primaryColor : 'var(--muted-foreground)',
                    background: isActive ? `${primaryColor}0D` : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 150ms ease',
                  }}
                >
                  <item.icon color={isActive ? primaryColor : 'var(--text-dim)'} size={18} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Right: Notifications + Avatar */}
          <div className="flex items-center gap-3">
            <PortalNotificationBell accessId={accessId} primaryColor={primaryColor} />
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: `${primaryColor}15`,
                border: `2px solid ${primaryColor}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: primaryColor,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {initials}
            </div>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                padding: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden" style={{ borderTop: '1px solid var(--border)', padding: '8px 24px 16px' }}>
            {NAV_ITEMS.map(item => {
              const itemPath = `${basePath}${item.path}`
              const isActive = item.path === ''
                ? pathname === basePath
                : pathname.startsWith(itemPath)

              return (
                <Link
                  key={item.path}
                  href={itemPath}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3"
                  style={{
                    padding: '12px 0',
                    fontSize: 16,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? primaryColor : 'var(--foreground)',
                    textDecoration: 'none',
                    borderBottom: '1px solid var(--muted)',
                  }}
                >
                  <item.icon color={isActive ? primaryColor : 'var(--text-dim)'} size={20} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* Page Content */}
      <main className="mx-auto max-w-[1280px] px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 py-6">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <p className="text-sm text-gray-400">
            {branding?.support_email && (
              <>
                Need help? <a href={`mailto:${branding.support_email}`} className="no-underline" style={{ color: primaryColor }}>{branding.support_email}</a>
                {' · '}
              </>
            )}
            Built with <span className="font-medium text-gray-500">BitBit</span>
          </p>
        </div>
      </footer>

      {/* Custom CSS injection */}
      {branding?.custom_css && <style dangerouslySetInnerHTML={{ __html: branding.custom_css }} />}
    </div>
  )
}

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function DashboardIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function ProjectsIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-6H4a2 2 0 0 0-2 2z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function InvoicesIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}

function FilesIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RequestsIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
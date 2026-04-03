'use client'

import Link from 'next/link'
import type { PortalDashboardStats } from '@/lib/portal/data'
import type { PortalProject, PortalActivity } from '@/lib/portal/types'

interface PortalDashboardProps {
  contactName: string
  stats: PortalDashboardStats
  projects: PortalProject[]
  activity: PortalActivity[]
  orgSlug: string
  primaryColor: string
  welcomeMessage: string | null
}

export function PortalDashboard({
  contactName,
  stats,
  projects,
  activity,
  orgSlug,
  primaryColor,
  welcomeMessage,
}: PortalDashboardProps) {
  const basePath = `/portal/${orgSlug}`
  const greeting = getGreeting()

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-base font-medium tracking-tight text-gray-900">
          {greeting}, {contactName.split(' ')[0]}
        </h1>
        {welcomeMessage && (
          <p className="mt-2 text-base text-gray-500">{welcomeMessage}</p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Projects"
          value={stats.activeProjects}
          icon={<ProjectIcon color={primaryColor} />}
          primaryColor={primaryColor}
          href={`${basePath}/projects`}
        />
        <StatCard
          label="Open Invoices"
          value={stats.pendingInvoices}
          subtext={stats.totalOwed > 0 ? `$${stats.totalOwed.toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : undefined}
          icon={<InvoiceIcon color={primaryColor} />}
          primaryColor={primaryColor}
          href={`${basePath}/invoices`}
        />
        <StatCard
          label="Open Requests"
          value={stats.openRequests}
          icon={<RequestIcon color={primaryColor} />}
          primaryColor={primaryColor}
          href={`${basePath}/requests`}
        />
        <StatCard
          label="Notifications"
          value={stats.unreadNotifications}
          icon={<BellIcon color={primaryColor} />}
          primaryColor={primaryColor}
        />
      </div>

      {/* Two-column: Projects + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-gray-900">Your Projects</h2>
            <Link
              href={`${basePath}/projects`}
              className="text-sm font-medium no-underline" style={{ color: primaryColor }}
            >
              View all
            </Link>
          </div>

          {projects.length === 0 ? (
            <div style={cardStyle} className="p-12 text-center">
              <p className="text-base text-gray-400">No projects yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {projects.slice(0, 4).map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  primaryColor={primaryColor}
                  basePath={basePath}
                />
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div>
          <h2 className="mb-4 text-base font-medium text-gray-900">Recent Activity</h2>

          {activity.length === 0 ? (
            <div style={cardStyle} className="p-12 text-center">
              <p className="text-base text-gray-400">No activity yet</p>
            </div>
          ) : (
            <div style={cardStyle}>
              {activity.map((item, i) => (
                <div
                  key={item.id}
                  className={`px-4 py-3 ${i < activity.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: item.read ? 'var(--border)' : primaryColor,
                        marginTop: 8,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p style={{ fontSize: 14, color: 'var(--foreground)', margin: 0, fontWeight: item.read ? 400 : 500 }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '4px 0 0' }}>
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 12,
  border: '1px solid var(--border)',
  overflow: 'hidden',
}

function StatCard({
  label,
  value,
  subtext,
  icon,
  primaryColor,
  href,
}: {
  label: string
  value: number
  subtext?: string
  icon: React.ReactNode
  primaryColor: string
  href?: string
}) {
  const content = (
    <div style={{ ...cardStyle, padding: '20px', cursor: href ? 'pointer' : 'default', transition: 'box-shadow 150ms' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${primaryColor}0D`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
      </div>
      <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>{label}</p>
      {subtext && <p style={{ fontSize: 14, color: primaryColor, margin: '4px 0 0', fontWeight: 500 }}>{subtext}</p>}
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>
  }
  return content
}

function ProjectCard({
  project,
  primaryColor,
  basePath,
}: {
  project: PortalProject
  primaryColor: string
  basePath: string
}) {
  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#ECFDF5', text: 'var(--success)' },
    planning: { bg: '#EFF6FF', text: '#2563EB' },
    on_hold: { bg: '#FEF3C7', text: 'var(--warning)' },
    completed: { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
    cancelled: { bg: '#FEF2F2', text: 'var(--destructive)' },
  }
  const sc = statusColors[project.status] ?? statusColors.active

  return (
    <Link href={`${basePath}/projects`} style={{ textDecoration: 'none' }}>
      <div style={{ ...cardStyle, padding: '20px', transition: 'box-shadow 150ms' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)', margin: 0 }}>{project.title}</h3>
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              padding: '4px 12px',
              borderRadius: 8,
              background: sc.bg,
              color: sc.text,
              textTransform: 'capitalize',
            }}
          >
            {project.status.replace('_', ' ')}
          </span>
        </div>

        {project.current_phase && (
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
            Phase: {project.current_phase}
          </p>
        )}

        {/* Progress Bar */}
        <div style={{ marginTop: 8 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Progress</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)' }}>{project.progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 8, background: 'var(--muted)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 8,
                background: primaryColor,
                width: `${project.progress}%`,
                transition: 'width 500ms ease',
              }}
            />
          </div>
        </div>

        {project.target_date && (
          <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '12px 0 0' }}>
            Target: {new Date(project.target_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </Link>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ProjectIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-6H4a2 2 0 0 0-2 2z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function InvoiceIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  )
}

function RequestIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function BellIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

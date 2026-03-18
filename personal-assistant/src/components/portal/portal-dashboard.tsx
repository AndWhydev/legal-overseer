'use client'

<<<<<<< HEAD
import { useState } from 'react'
import type { PortalBranding, PortalPermissions, PortalProject, PortalInvoice, PortalFile, PortalRequest } from '@/lib/portal/types'
import { PortalHeader } from './portal-header'
import { PortalProjects } from './portal-projects'
import { PortalInvoices } from './portal-invoices'
import { PortalFiles } from './portal-files'
import { PortalRequests } from './portal-requests'

type Tab = 'overview' | 'projects' | 'invoices' | 'files' | 'requests'

interface PortalDashboardProps {
  context: {
    contact: { id: string; name: string; email: string }
    org: { id: string; name: string; slug: string }
    branding: PortalBranding | null
    permissions: PortalPermissions
  }
  projects: PortalProject[]
  invoices: PortalInvoice[]
  files: PortalFile[]
  requests: PortalRequest[]
}

export function PortalDashboard({ context, projects, invoices, files, requests }: PortalDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const { branding, permissions, contact, org } = context
  const primary = branding?.primary_color || '#2563eb'

  const allTabs: { id: Tab; label: string; visible: boolean; count?: number }[] = [
    { id: 'overview' as Tab, label: 'Overview', visible: true },
    { id: 'projects' as Tab, label: 'Projects', visible: permissions.view_projects, count: projects.length },
    { id: 'invoices' as Tab, label: 'Invoices', visible: permissions.view_invoices, count: invoices.length },
    { id: 'files' as Tab, label: 'Files', visible: true, count: files.length },
    { id: 'requests' as Tab, label: 'Requests', visible: permissions.submit_requests, count: requests.length },
  ]
  const tabs = allTabs.filter(t => t.visible)

  const activeProjects = projects.filter(p => p.status === 'active')
  const pendingInvoices = invoices.filter(i => ['sent', 'viewed'].includes(i.status))
  const totalOwed = pendingInvoices.reduce((sum, i) => sum + Number(i.total), 0)
  const openRequests = requests.filter(r => !['completed', 'closed'].includes(r.status))

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafbfc' }}>
      <PortalHeader
        orgName={branding?.company_name || org.name}
        contactName={contact.name}
        logoUrl={branding?.logo_url || undefined}
        primaryColor={primary}
        tagline={branding?.tagline || undefined}
      />

      {/* Tab Navigation */}
      <div style={{
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? primary : '#6b7280',
                borderBottom: activeTab === tab.id ? `2px solid ${primary}` : '2px solid transparent',
                background: 'none',
                border: 'none',
                borderBottomStyle: 'solid',
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab.id ? primary : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span style={{
                  backgroundColor: activeTab === tab.id ? `${primary}15` : '#f3f4f6',
                  color: activeTab === tab.id ? primary : '#9ca3af',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 10,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            activeProjects={activeProjects}
            pendingInvoices={pendingInvoices}
            totalOwed={totalOwed}
            openRequests={openRequests}
            files={files}
            primary={primary}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'projects' && <PortalProjects projects={projects} primary={primary} />}
        {activeTab === 'invoices' && <PortalInvoices invoices={invoices} primary={primary} />}
        {activeTab === 'files' && <PortalFiles files={files} orgSlug={org.slug} canUpload={permissions.upload_files} primary={primary} />}
        {activeTab === 'requests' && <PortalRequests requests={requests} projects={projects} orgSlug={org.slug} primary={primary} />}
      </div>

      {/* Footer */}
      {branding?.footer_text && (
        <div style={{
          textAlign: 'center',
          padding: '24px',
          fontSize: 13,
          color: '#9ca3af',
          borderTop: '1px solid #f3f4f6',
        }}>
          {branding.footer_text}
        </div>
      )}
    </div>
  )
}

function OverviewTab({
  activeProjects,
  pendingInvoices,
  totalOwed,
  openRequests,
  files,
  primary,
  onNavigate,
}: {
  activeProjects: PortalProject[]
  pendingInvoices: PortalInvoice[]
  totalOwed: number
  openRequests: PortalRequest[]
  files: PortalFile[]
  primary: string
  onNavigate: (tab: Tab) => void
}) {
  const stats = [
    { label: 'Active Projects', value: activeProjects.length, tab: 'projects' as Tab },
    { label: 'Pending Invoices', value: pendingInvoices.length, tab: 'invoices' as Tab },
    { label: 'Amount Due', value: `$${totalOwed.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, tab: 'invoices' as Tab },
    { label: 'Open Requests', value: openRequests.length, tab: 'requests' as Tab },
  ]

  return (
    <div>
      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {stats.map(stat => (
          <button
            key={stat.label}
            onClick={() => onNavigate(stat.tab)}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              padding: '20px 24px',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = primary;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 1px ${primary}20`;
            }}
            onMouseOut={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>{stat.value}</div>
          </button>
        ))}
      </div>

      {/* Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
        {/* Active Projects */}
        {activeProjects.length > 0 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#1a1a2e' }}>Active Projects</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeProjects.slice(0, 5).map(project => (
                <div key={project.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>{project.name}</span>
                  <span style={{
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 6,
                    backgroundColor: '#ecfdf5',
                    color: '#059669',
                    fontWeight: 500,
                  }}>Active</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Files */}
        {files.length > 0 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#1a1a2e' }}>Recent Files</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {files.slice(0, 5).map(file => (
                <div key={file.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>{file.file_name}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {formatFileSize(file.file_size)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
=======
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
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
          {greeting}, {contactName.split(' ')[0]}
        </h1>
        {welcomeMessage && (
          <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8 }}>{welcomeMessage}</p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: 40 }}>
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
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Your Projects</h2>
            <Link
              href={`${basePath}/projects`}
              style={{ fontSize: 14, color: primaryColor, textDecoration: 'none', fontWeight: 500 }}
            >
              View all
            </Link>
          </div>

          {projects.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 15 }}>No projects yet</p>
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Recent Activity</h2>

          {activity.length === 0 ? (
            <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 15 }}>No activity yet</p>
            </div>
          ) : (
            <div style={cardStyle}>
              {activity.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: i < activity.length - 1 ? '1px solid #F3F4F6' : 'none',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: item.read ? '#D1D5DB' : primaryColor,
                        marginTop: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p style={{ fontSize: 14, color: '#111827', margin: 0, fontWeight: item.read ? 400 : 500 }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>
                        {formatRelative(item.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
>>>>>>> v1.5-marketing-launch
      </div>
    </div>
  )
}

<<<<<<< HEAD
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
=======
// ─── Sub-components ──────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid #E5E7EB',
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
            borderRadius: 10,
            background: `${primaryColor}0D`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
      </div>
      <p style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>{label}</p>
      {subtext && <p style={{ fontSize: 13, color: primaryColor, margin: '4px 0 0', fontWeight: 500 }}>{subtext}</p>}
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
    active: { bg: '#ECFDF5', text: '#059669' },
    planning: { bg: '#EFF6FF', text: '#2563EB' },
    on_hold: { bg: '#FEF3C7', text: '#D97706' },
    completed: { bg: '#F3F4F6', text: '#6B7280' },
    cancelled: { bg: '#FEF2F2', text: '#DC2626' },
  }
  const sc = statusColors[project.status] ?? statusColors.active

  return (
    <Link href={`${basePath}/projects`} style={{ textDecoration: 'none' }}>
      <div style={{ ...cardStyle, padding: '20px', transition: 'box-shadow 150ms' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>{project.title}</h3>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              background: sc.bg,
              color: sc.text,
              textTransform: 'capitalize',
            }}
          >
            {project.status.replace('_', ' ')}
          </span>
        </div>

        {project.current_phase && (
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px' }}>
            Phase: {project.current_phase}
          </p>
        )}

        {/* Progress Bar */}
        <div style={{ marginTop: 8 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>Progress</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{project.progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#F3F4F6', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                background: primaryColor,
                width: `${project.progress}%`,
                transition: 'width 500ms ease',
              }}
            />
          </div>
        </div>

        {project.target_date && (
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '12px 0 0' }}>
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
>>>>>>> v1.5-marketing-launch
}

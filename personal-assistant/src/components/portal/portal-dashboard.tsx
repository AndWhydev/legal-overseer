'use client'

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
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

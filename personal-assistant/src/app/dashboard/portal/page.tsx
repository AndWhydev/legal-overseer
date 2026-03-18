import { PortalManagement } from '@/components/portal/portal-management'

export default function DashboardPortalPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>Client Portal</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)' }}>
          Manage client access, branding, and portal settings.
        </p>
      </header>
      <PortalManagement />
    </div>
  )
}

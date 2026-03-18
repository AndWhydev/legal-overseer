import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalProjects, getPortalInvoices, getPortalFiles, getPortalRequests } from '@/lib/portal/data'
import { PortalDashboard } from '@/components/portal/portal-dashboard'

interface PortalPageProps {
  params: Promise<{ slug: string }>
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params

  const ctx = await getPortalContext(slug)
  if (!ctx) {
    redirect(`/login?next=/portal/${slug}`)
  }

  const [projects, invoices, files, requests] = await Promise.all([
    ctx.access.permissions.view_projects ? getPortalProjects(ctx) : [],
    ctx.access.permissions.view_invoices ? getPortalInvoices(ctx) : [],
    getPortalFiles(ctx),
    getPortalRequests(ctx),
  ])

  return (
    <PortalDashboard
      context={{
        contact: ctx.contact,
        org: ctx.org,
        branding: ctx.branding,
        permissions: ctx.access.permissions,
      }}
      projects={projects}
      invoices={invoices}
      files={files}
      requests={requests}
    />
  )
}

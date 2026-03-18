<<<<<<< HEAD
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
=======
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalDashboardStats } from '@/lib/portal/data'
import { getPortalProjects } from '@/lib/portal/data'
import { getPortalActivity } from '@/lib/portal/data'
import { redirect } from 'next/navigation'
import { PortalDashboard } from '@/components/portal/portal-dashboard'

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)
  if (!ctx) redirect(`/portal/login?next=/portal/${slug}`)

  const [stats, projects, activity] = await Promise.all([
    getPortalDashboardStats(ctx.access.org_id, ctx.access.contact_id, ctx.access.id),
    getPortalProjects(ctx.access.org_id, ctx.access.contact_id),
    getPortalActivity(ctx.access.org_id, ctx.access.contact_id, { limit: 10 }),
>>>>>>> v1.5-marketing-launch
  ])

  return (
    <PortalDashboard
<<<<<<< HEAD
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
=======
      contactName={ctx.contactName}
      stats={stats}
      projects={projects}
      activity={activity}
      orgSlug={slug}
      primaryColor={ctx.branding?.primary_color ?? '#2563EB'}
      welcomeMessage={ctx.branding?.welcome_message ?? null}
>>>>>>> v1.5-marketing-launch
    />
  )
}

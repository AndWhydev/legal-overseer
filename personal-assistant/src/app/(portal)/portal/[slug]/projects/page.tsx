import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalProjects } from '@/lib/portal/data'
import { PortalProjectsView } from '@/components/portal/portal-projects'

export default async function PortalProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)
  if (!ctx) redirect(`/portal/login?next=/portal/${slug}/projects`)

  const projects = await getPortalProjects(ctx.access.org_id, ctx.access.contact_id)

  return (
    <PortalProjectsView
      projects={projects}
      orgSlug={slug}
      primaryColor={ctx.branding?.primary_color ?? '#2563EB'}
    />
  )
}

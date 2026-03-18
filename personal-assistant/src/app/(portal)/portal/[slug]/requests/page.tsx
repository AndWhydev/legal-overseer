import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalRequests } from '@/lib/portal/data'
import { PortalRequestsView } from '@/components/portal/portal-requests'

export default async function PortalRequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)
  if (!ctx) redirect(`/portal/login?next=/portal/${slug}/requests`)

  const requests = await getPortalRequests(ctx.access.org_id, ctx.access.contact_id)

  return (
    <PortalRequestsView
      initialRequests={requests}
      primaryColor={ctx.branding?.primary_color ?? '#2563EB'}
    />
  )
}

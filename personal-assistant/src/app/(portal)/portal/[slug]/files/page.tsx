import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalFiles } from '@/lib/portal/data'
import { PortalFilesView } from '@/components/portal/portal-files'

export default async function PortalFilesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)
  if (!ctx) redirect(`/portal/login?next=/portal/${slug}/files`)

  const files = await getPortalFiles(ctx.access.org_id, ctx.access.contact_id)

  return (
    <PortalFilesView
      initialFiles={files}
      primaryColor={ctx.branding?.primary_color ?? '#2563EB'}
    />
  )
}

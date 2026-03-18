import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { PortalShell } from '@/components/portal/portal-shell'

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)

  if (!ctx) {
    redirect(`/portal/login?next=/portal/${slug}`)
  }

  return (
    <PortalShell
      branding={ctx.branding}
      orgName={ctx.orgName}
      contactName={ctx.contactName}
      orgSlug={slug}
      accessId={ctx.access.id}
    >
      {children}
    </PortalShell>
  )
}

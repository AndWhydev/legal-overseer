import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/portal/auth'
import { getPortalInvoices } from '@/lib/portal/data'
import { PortalInvoicesView } from '@/components/portal/portal-invoices'

export default async function PortalInvoicesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getPortalContext(slug)
  if (!ctx) redirect(`/portal/login?next=/portal/${slug}/invoices`)

  const invoices = await getPortalInvoices(ctx.access.org_id, ctx.access.contact_id)

  return (
    <PortalInvoicesView
      invoices={invoices}
      primaryColor={ctx.branding?.primary_color ?? '#2563EB'}
    />
  )
}

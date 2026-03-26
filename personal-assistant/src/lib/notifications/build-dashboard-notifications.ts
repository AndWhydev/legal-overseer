export interface DashboardNotificationItem {
  id: string
  type: 'approval' | 'lead' | 'invoice' | 'task'
  title: string
  description: string
  timestamp: Date
  read: boolean
  tabId: string
}

interface ApprovalRow {
  id: string
  created_at: string
}

interface LeadRow {
  id: string
  source_channel: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface InvoiceRow {
  id: string
  invoice_number: string
  created_at: string
}

/** Map internal source_channel identifiers to user-facing display names */
const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  prospect_discovery: 'Prospect Discovery',
  pcc_discovery: 'Prospect Discovery',
  gmail: 'Gmail',
  outlook: 'Outlook',
  email: 'Email',
  whatsapp: 'WhatsApp',
  web: 'Website',
  imessage: 'iMessage',
  manual: 'Manual Entry',
}

function displaySource(channel: string): string {
  return SOURCE_DISPLAY_NAMES[channel] ?? channel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fingerprint(item: DashboardNotificationItem) {
  return [
    item.type,
    item.title,
    item.description,
    item.timestamp.toISOString().slice(0, 10),
  ].join('::')
}

export function buildDashboardNotifications({
  approvals,
  leads,
  invoices,
}: {
  approvals: ApprovalRow[]
  leads: LeadRow[]
  invoices: InvoiceRow[]
}): DashboardNotificationItem[] {
  const items: DashboardNotificationItem[] = [
    ...approvals.map((approval) => ({
      id: `approval-${approval.id}`,
      type: 'approval' as const,
      title: 'Approval Pending',
      description: 'A document requires your approval',
      timestamp: new Date(approval.created_at),
      read: false,
      tabId: 'approvals',
    })),
    ...leads.map((lead) => {
      const leadName = String(
        lead.metadata?.name || lead.metadata?.company || 'Someone',
      )
      const source = lead.source_channel
        ? displaySource(lead.source_channel)
        : null

      return {
        id: `lead-${lead.id}`,
        type: 'lead' as const,
        title: 'New Lead',
        description: source
          ? `${leadName} via ${source}`
          : `${leadName} signed up`,
        timestamp: new Date(lead.created_at),
        read: false,
        tabId: 'leads',
      }
    }),
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: 'invoice' as const,
      title: 'Overdue Invoice',
      description: `Invoice ${invoice.invoice_number} is overdue`,
      timestamp: new Date(invoice.created_at),
      read: false,
      tabId: 'invoices',
    })),
  ]

  const deduped = new Map<string, DashboardNotificationItem>()

  for (const item of items) {
    const key = fingerprint(item)
    const current = deduped.get(key)

    if (!current || current.timestamp < item.timestamp) {
      deduped.set(key, item)
    }
  }

  return [...deduped.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

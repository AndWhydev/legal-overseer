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
        lead.metadata?.name || lead.metadata?.company || lead.source_channel || 'Unknown',
      )

      return {
        id: `lead-${lead.id}`,
        type: 'lead' as const,
        title: 'New Lead',
        description: `${leadName} signed up`,
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

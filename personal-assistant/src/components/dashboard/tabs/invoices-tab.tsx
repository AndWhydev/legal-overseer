'use client'

import React from 'react'
import { ReceiptText } from 'lucide-react'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { TabShell } from '@/components/ui/tab-shell'
import { TabHeader } from '@/components/ui/tab-header'

function InvoicesTab() {
  return (
    <TabShell>
      <TabHeader
        icon={<ReceiptText size={22} />}
        iconColor="var(--bb-purple)"
        title="Invoices"
        subtitle="Track invoice status, queue sends for approval, and close out payments"
      />
      <InvoiceList />
    </TabShell>
  )
}

export default React.memo(InvoicesTab)

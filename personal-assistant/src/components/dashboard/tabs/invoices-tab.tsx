'use client'

import React from 'react'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { TabShell } from '@/components/ui/tab-shell'

function InvoicesTab() {
  return (
    <TabShell>
      <InvoiceList />
    </TabShell>
  )
}

export default React.memo(InvoicesTab)

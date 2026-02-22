'use client'

import React from 'react'
import { ReceiptText } from 'lucide-react'
import { InvoiceList } from '@/components/invoices/invoice-list'

function InvoicesTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
          <ReceiptText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Track invoice status, queue sends for approval, and close out payments</p>
        </div>
      </div>

      <InvoiceList />
    </div>
  )
}

export default React.memo(InvoicesTab)

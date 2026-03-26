'use client'

import React, { useState } from 'react'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { InvoiceTemplateEditor } from '@/components/invoices/invoice-template-editor'
import { TabShell } from '@/components/ui/tab-shell'
import { GlassToggle } from '@/components/ui/glass-toggle'

type InvoiceView = 'list' | 'template'

function InvoicesTab() {
  const [view, setView] = useState<InvoiceView>('list')

  return (
    <TabShell>
      <div style={{ marginBottom: 16 }}>
        <GlassToggle
          options={[
            { key: 'list' as const, label: 'Invoices' },
            { key: 'template' as const, label: 'Template' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'list' ? <InvoiceList /> : <InvoiceTemplateEditor />}
    </TabShell>
  )
}

export default React.memo(InvoicesTab)

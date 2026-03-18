'use client'

import React, { useState } from 'react'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { InvoiceTemplateEditor } from '@/components/invoices/invoice-template-editor'
import { TabShell } from '@/components/ui/tab-shell'

type InvoiceView = 'list' | 'template'

function InvoicesTab() {
  const [view, setView] = useState<InvoiceView>('list')

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: 20,
    border: 'none',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#E2E8F0' : '#64748B',
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <TabShell>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(15,20,30,0.4)', padding: 4, borderRadius: 20, width: 'fit-content' }}>
        <button onClick={() => setView('list')} style={toggleStyle(view === 'list')}>Invoices</button>
        <button onClick={() => setView('template')} style={toggleStyle(view === 'template')}>Template</button>
      </div>
      {view === 'list' ? <InvoiceList /> : <InvoiceTemplateEditor />}
    </TabShell>
  )
}

export default React.memo(InvoicesTab)

'use client'

import React, { useState } from 'react'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { InvoiceTemplateEditor } from '@/components/invoices/invoice-template-editor'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

function InvoicesTab() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Invoices</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <InvoiceList />
        </TabsContent>
        <TabsContent value="template">
          <InvoiceTemplateEditor />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default React.memo(InvoicesTab)

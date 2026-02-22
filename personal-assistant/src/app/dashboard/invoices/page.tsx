import { InvoiceList } from '@/components/invoices/invoice-list'

export default function InvoicesDashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Review invoice lifecycle states and resolve sending, payment, and cancellation actions.
        </p>
      </header>
      <InvoiceList />
    </div>
  )
}

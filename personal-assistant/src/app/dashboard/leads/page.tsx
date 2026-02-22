import { LeadsKanban } from '@/components/leads/leads-kanban'

export default function LeadsDashboardPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Lead Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Review qualified opportunities and move them through New, Qualified, Booked, and Won/Lost.
        </p>
      </header>
      <LeadsKanban />
    </div>
  )
}

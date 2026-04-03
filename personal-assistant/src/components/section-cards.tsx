"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react"
import { useDashboardStats } from "@/hooks/use-dashboard-stats"
import { useAppData } from "@/lib/data/app-data-provider"
import { useChartData } from "@/hooks/use-chart-data"

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SectionCards() {
  const { stats, loading } = useDashboardStats()
  const { leads, agentRuns } = useAppData()
  const { data: chartData } = useChartData()

  const revenue = stats?.totalRevenue ?? 0
  const activeTasks = stats?.activeTasks ?? 0
  const contacts = stats?.activeContacts ?? 0
  const agentRunsToday = stats?.agentRunsToday ?? 0
  const messageCount = chartData.totalMessages
  const leadCount = leads.length

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32 mt-1" />
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Revenue</CardDescription>
          <CardTitle className="text-2xl font-medium tabular-nums @[250px]/card:text-3xl">
            {revenue > 0 ? formatCurrency(revenue) : '—'}
          </CardTitle>
          <CardAction>
            {revenue > 0 ? (
              <Badge variant="outline"><IconTrendingUp /> Paid</Badge>
            ) : (
              <Badge variant="secondary">No invoices</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {revenue > 0 ? 'From paid invoices' : 'Create your first invoice to track revenue'}
          </div>
          <div className="text-muted-foreground">
            {contacts} contacts
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Tasks</CardDescription>
          <CardTitle className="text-2xl font-medium tabular-nums @[250px]/card:text-3xl">
            {activeTasks.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">{activeTasks} open</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {agentRunsToday > 0 ? `${agentRunsToday} agent runs today` : 'No agent runs yet today'}
          </div>
          <div className="text-muted-foreground">
            Across all workflows
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Messages</CardDescription>
          <CardTitle className="text-2xl font-medium tabular-nums @[250px]/card:text-3xl">
            {messageCount.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">All time</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Across all channels
          </div>
          <div className="text-muted-foreground">
            {leadCount} leads in pipeline
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Agent Runs</CardDescription>
          <CardTitle className="text-2xl font-medium tabular-nums @[250px]/card:text-3xl">
            {agentRunsToday > 0 ? agentRunsToday.toLocaleString() : '—'}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">Today</Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {agentRuns.length > 0 ? `${agentRuns.length} recent runs` : 'Runs logged automatically'}
          </div>
          <div className="text-muted-foreground">
            Orchestrator + Swarm + Cron
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

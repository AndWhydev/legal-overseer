"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  data: { status: string; count: number }[]
  loading?: boolean
}

const chartConfig = {
  count: { label: "Tasks", color: "var(--chart-1)" },
} satisfies ChartConfig

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
}

const ALL_STATUSES = ["pending", "in_progress", "completed", "archived"] as const

export function ChartBarTasks({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  // Always show all status categories so the chart doesn't look broken
  // when tasks are concentrated in a single status
  const countMap = new Map(data.map(d => [d.status, d.count]))
  const chartData = ALL_STATUSES.map(s => ({
    status: STATUS_LABELS[s] ?? s,
    count: countMap.get(s) ?? 0,
  }))

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader><CardTitle>Tasks by Status</CardTitle></CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
          No task data yet
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Tasks by Status</CardTitle>
        <CardDescription>Distribution across workflow states</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="status" tickLine={false} tickMargin={10} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  data: { month: string; avgMs: number }[]
  loading?: boolean
}

const chartConfig = {
  avgMs: { label: "Avg Duration (ms)", color: "var(--chart-1)" },
} satisfies ChartConfig

const lineChartMargin = { left: 12, right: 12 }

export function ChartLinePerformance({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  const chartData = data.map(d => ({
    month: new Date(d.month + '-01').toLocaleDateString('en-AU', { month: 'short' }),
    avgMs: d.avgMs,
  }))

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle>Response Times</CardTitle></CardHeader>
        <CardContent className="flex h-[250px] flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <span>{chartData.length === 0 ? 'No performance data yet' : `${chartData[0]?.avgMs}ms avg in ${chartData[0]?.month}`}</span>
          <span className="text-xs">Trend will appear with more months of data</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Response Times</CardTitle>
        <CardDescription>Average agent duration by month</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <LineChart accessibilityLayer data={chartData} margin={lineChartMargin}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={50} tickFormatter={v => `${v}ms`} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Line dataKey="avgMs" type="monotone" stroke="var(--color-avgMs)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

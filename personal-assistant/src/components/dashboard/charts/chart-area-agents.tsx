"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-mobile"

interface Props {
  data: { date: string; scheduled: number; webhook: number; manual: number }[]
  loading?: boolean
}

const chartConfig = {
  runs: { label: "Runs" },
  scheduled: { label: "Scheduled", color: "var(--chart-1)" },
  webhook: { label: "Webhook", color: "var(--chart-2)" },
  manual: { label: "Manual", color: "var(--chart-3)" },
} satisfies ChartConfig

export function ChartAreaAgents({ data, loading }: Props) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d")
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (!data.length) return []
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return data.filter(d => new Date(d.date) >= cutoff)
  }, [data, timeRange])

  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  if (filteredData.length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle>Agent Activity</CardTitle></CardHeader>
        <CardContent className="flex h-[250px] flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <span>{filteredData.length === 0 ? 'No agent activity yet' : `${filteredData[0]?.scheduled + filteredData[0]?.webhook + filteredData[0]?.manual} runs on ${new Date(filteredData[0]?.date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}`}</span>
          <span className="text-xs">Activity chart will appear with more data</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Agent Activity</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">Runs by trigger type over time</span>
          <span className="@[540px]/card:hidden">Agent runs over time</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup type="single" value={timeRange} onValueChange={setTimeRange} variant="outline" className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex">
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden" size="sm" aria-label="Time range">
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">Last 3 months</SelectItem>
              <SelectItem value="30d" className="rounded-lg">Last 30 days</SelectItem>
              <SelectItem value="7d" className="rounded-lg">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillScheduled" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-scheduled)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-scheduled)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillWebhook" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-webhook)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="var(--color-webhook)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillManual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-manual)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-manual)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
              tickFormatter={v => new Date(v).toLocaleDateString("en-AU", { month: "short", day: "numeric" })} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent
              labelFormatter={v => new Date(v).toLocaleDateString("en-AU", { month: "short", day: "numeric" })} indicator="dot" />} />
            <Area dataKey="manual" type="natural" fill="url(#fillManual)" stroke="var(--color-manual)" stackId="a" />
            <Area dataKey="webhook" type="natural" fill="url(#fillWebhook)" stroke="var(--color-webhook)" stackId="a" />
            <Area dataKey="scheduled" type="natural" fill="url(#fillScheduled)" stroke="var(--color-scheduled)" stackId="a" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

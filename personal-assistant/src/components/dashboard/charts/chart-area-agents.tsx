"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"

const chartData = [
  { date: "2026-01-01", orchestrator: 42, swarm: 28, cron: 15 },
  { date: "2026-01-02", orchestrator: 38, swarm: 32, cron: 18 },
  { date: "2026-01-03", orchestrator: 55, swarm: 24, cron: 12 },
  { date: "2026-01-04", orchestrator: 47, swarm: 35, cron: 20 },
  { date: "2026-01-05", orchestrator: 61, swarm: 41, cron: 16 },
  { date: "2026-01-06", orchestrator: 34, swarm: 22, cron: 14 },
  { date: "2026-01-07", orchestrator: 29, swarm: 19, cron: 11 },
  { date: "2026-01-08", orchestrator: 52, swarm: 37, cron: 19 },
  { date: "2026-01-09", orchestrator: 58, swarm: 44, cron: 22 },
  { date: "2026-01-10", orchestrator: 63, swarm: 39, cron: 17 },
  { date: "2026-01-11", orchestrator: 71, swarm: 48, cron: 25 },
  { date: "2026-01-12", orchestrator: 45, swarm: 31, cron: 13 },
  { date: "2026-01-13", orchestrator: 39, swarm: 26, cron: 10 },
  { date: "2026-01-14", orchestrator: 67, swarm: 52, cron: 21 },
  { date: "2026-01-15", orchestrator: 73, swarm: 46, cron: 24 },
  { date: "2026-01-16", orchestrator: 56, swarm: 38, cron: 18 },
  { date: "2026-01-17", orchestrator: 82, swarm: 55, cron: 28 },
  { date: "2026-01-18", orchestrator: 48, swarm: 33, cron: 15 },
  { date: "2026-01-19", orchestrator: 35, swarm: 21, cron: 12 },
  { date: "2026-01-20", orchestrator: 59, swarm: 42, cron: 20 },
  { date: "2026-01-21", orchestrator: 76, swarm: 51, cron: 26 },
  { date: "2026-01-22", orchestrator: 64, swarm: 43, cron: 19 },
  { date: "2026-01-23", orchestrator: 88, swarm: 59, cron: 31 },
  { date: "2026-01-24", orchestrator: 51, swarm: 36, cron: 16 },
  { date: "2026-01-25", orchestrator: 43, swarm: 28, cron: 14 },
  { date: "2026-01-26", orchestrator: 37, swarm: 24, cron: 11 },
  { date: "2026-01-27", orchestrator: 69, swarm: 47, cron: 23 },
  { date: "2026-01-28", orchestrator: 78, swarm: 53, cron: 27 },
  { date: "2026-01-29", orchestrator: 85, swarm: 57, cron: 29 },
  { date: "2026-01-30", orchestrator: 62, swarm: 40, cron: 18 },
  { date: "2026-02-01", orchestrator: 54, swarm: 34, cron: 16 },
  { date: "2026-02-02", orchestrator: 41, swarm: 27, cron: 13 },
  { date: "2026-02-03", orchestrator: 36, swarm: 23, cron: 10 },
  { date: "2026-02-04", orchestrator: 65, swarm: 44, cron: 21 },
  { date: "2026-02-05", orchestrator: 72, swarm: 49, cron: 25 },
  { date: "2026-02-06", orchestrator: 80, swarm: 54, cron: 28 },
  { date: "2026-02-07", orchestrator: 57, swarm: 38, cron: 17 },
  { date: "2026-02-08", orchestrator: 46, swarm: 30, cron: 14 },
  { date: "2026-02-09", orchestrator: 33, swarm: 20, cron: 9 },
  { date: "2026-02-10", orchestrator: 60, swarm: 41, cron: 19 },
  { date: "2026-02-11", orchestrator: 74, swarm: 50, cron: 24 },
  { date: "2026-02-12", orchestrator: 68, swarm: 45, cron: 22 },
  { date: "2026-02-13", orchestrator: 91, swarm: 62, cron: 33 },
  { date: "2026-02-14", orchestrator: 53, swarm: 35, cron: 15 },
  { date: "2026-02-15", orchestrator: 44, swarm: 29, cron: 13 },
  { date: "2026-02-16", orchestrator: 38, swarm: 25, cron: 11 },
  { date: "2026-02-17", orchestrator: 70, swarm: 48, cron: 23 },
  { date: "2026-02-18", orchestrator: 83, swarm: 56, cron: 29 },
  { date: "2026-02-19", orchestrator: 77, swarm: 52, cron: 26 },
  { date: "2026-02-20", orchestrator: 66, swarm: 43, cron: 20 },
  { date: "2026-02-21", orchestrator: 55, swarm: 36, cron: 17 },
  { date: "2026-02-22", orchestrator: 40, swarm: 26, cron: 12 },
  { date: "2026-02-23", orchestrator: 48, swarm: 31, cron: 14 },
  { date: "2026-02-24", orchestrator: 75, swarm: 51, cron: 25 },
  { date: "2026-02-25", orchestrator: 87, swarm: 58, cron: 30 },
  { date: "2026-02-26", orchestrator: 93, swarm: 64, cron: 34 },
  { date: "2026-02-27", orchestrator: 69, swarm: 46, cron: 22 },
  { date: "2026-02-28", orchestrator: 58, swarm: 39, cron: 18 },
  { date: "2026-03-01", orchestrator: 50, swarm: 33, cron: 15 },
  { date: "2026-03-02", orchestrator: 43, swarm: 28, cron: 13 },
  { date: "2026-03-03", orchestrator: 71, swarm: 48, cron: 24 },
  { date: "2026-03-04", orchestrator: 79, swarm: 54, cron: 27 },
  { date: "2026-03-05", orchestrator: 86, swarm: 58, cron: 30 },
  { date: "2026-03-06", orchestrator: 64, swarm: 42, cron: 20 },
  { date: "2026-03-07", orchestrator: 52, swarm: 34, cron: 16 },
  { date: "2026-03-08", orchestrator: 45, swarm: 29, cron: 14 },
  { date: "2026-03-09", orchestrator: 38, swarm: 24, cron: 11 },
  { date: "2026-03-10", orchestrator: 73, swarm: 50, cron: 25 },
  { date: "2026-03-11", orchestrator: 81, swarm: 55, cron: 28 },
  { date: "2026-03-12", orchestrator: 90, swarm: 61, cron: 32 },
  { date: "2026-03-13", orchestrator: 67, swarm: 45, cron: 21 },
  { date: "2026-03-14", orchestrator: 56, swarm: 37, cron: 17 },
  { date: "2026-03-15", orchestrator: 47, swarm: 31, cron: 14 },
  { date: "2026-03-16", orchestrator: 41, swarm: 27, cron: 12 },
  { date: "2026-03-17", orchestrator: 76, swarm: 52, cron: 26 },
  { date: "2026-03-18", orchestrator: 84, swarm: 57, cron: 29 },
  { date: "2026-03-19", orchestrator: 95, swarm: 65, cron: 35 },
  { date: "2026-03-20", orchestrator: 72, swarm: 48, cron: 23 },
  { date: "2026-03-21", orchestrator: 60, swarm: 40, cron: 19 },
  { date: "2026-03-22", orchestrator: 49, swarm: 32, cron: 15 },
  { date: "2026-03-23", orchestrator: 44, swarm: 28, cron: 13 },
  { date: "2026-03-24", orchestrator: 78, swarm: 53, cron: 27 },
  { date: "2026-03-25", orchestrator: 89, swarm: 60, cron: 31 },
  { date: "2026-03-26", orchestrator: 97, swarm: 66, cron: 36 },
  { date: "2026-03-27", orchestrator: 74, swarm: 50, cron: 24 },
]

const chartConfig = {
  tasks: { label: "Tasks" },
  orchestrator: { label: "Orchestrator", color: "var(--chart-1)" },
  swarm: { label: "Swarm", color: "var(--chart-2)" },
  cron: { label: "Cron", color: "var(--chart-3)" },
} satisfies ChartConfig

export function ChartAreaAgents() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d")
  }, [isMobile])

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const ref = new Date("2026-03-27")
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const start = new Date(ref)
    start.setDate(start.getDate() - days)
    return date >= start
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Agent Activity</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Tasks processed by agent type over time
          </span>
          <span className="@[540px]/card:hidden">Agent tasks over time</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
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
              <linearGradient id="fillOrchestrator" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-orchestrator)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-orchestrator)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillSwarm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-swarm)" stopOpacity={0.6} />
                <stop offset="95%" stopColor="var(--color-swarm)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="fillCron" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-cron)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-cron)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-AU", { month: "short", day: "numeric" })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-AU", { month: "short", day: "numeric" })
                  }
                  indicator="dot"
                />
              }
            />
            <Area dataKey="cron" type="natural" fill="url(#fillCron)" stroke="var(--color-cron)" stackId="a" />
            <Area dataKey="swarm" type="natural" fill="url(#fillSwarm)" stroke="var(--color-swarm)" stackId="a" />
            <Area dataKey="orchestrator" type="natural" fill="url(#fillOrchestrator)" stroke="var(--color-orchestrator)" stackId="a" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

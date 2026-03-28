"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { month: "Jan", api: 120, agent: 340, queue: 85 },
  { month: "Feb", api: 105, agent: 290, queue: 72 },
  { month: "Mar", api: 98, agent: 260, queue: 68 },
  { month: "Apr", api: 112, agent: 310, queue: 78 },
  { month: "May", api: 89, agent: 245, queue: 62 },
  { month: "Jun", api: 95, agent: 270, queue: 65 },
  { month: "Jul", api: 82, agent: 230, queue: 58 },
  { month: "Aug", api: 78, agent: 215, queue: 55 },
  { month: "Sep", api: 91, agent: 255, queue: 63 },
  { month: "Oct", api: 74, agent: 198, queue: 51 },
  { month: "Nov", api: 68, agent: 185, queue: 48 },
  { month: "Dec", api: 65, agent: 172, queue: 45 },
]

const chartConfig = {
  api: { label: "API (ms)", color: "var(--chart-1)" },
  agent: { label: "Agent (ms)", color: "var(--chart-2)" },
  queue: { label: "Queue (ms)", color: "var(--chart-4)" },
} satisfies ChartConfig

const lineChartMargin = { left: 12, right: 12 }

export function ChartLinePerformance() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Response Times</CardTitle>
        <CardDescription>Average latency trends over 12 months</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <LineChart accessibilityLayer data={chartData} margin={lineChartMargin}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="api"
              type="monotone"
              stroke="var(--color-api)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="agent"
              type="monotone"
              stroke="var(--color-agent)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="queue"
              type="monotone"
              stroke="var(--color-queue)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

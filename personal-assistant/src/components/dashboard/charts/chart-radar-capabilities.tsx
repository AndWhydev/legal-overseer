"use client"

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { IconTrendingUp } from "@tabler/icons-react"

const chartData = [
  { metric: "Speed", current: 92, previous: 78 },
  { metric: "Accuracy", current: 88, previous: 82 },
  { metric: "Coverage", current: 76, previous: 65 },
  { metric: "Autonomy", current: 84, previous: 70 },
  { metric: "Reliability", current: 95, previous: 88 },
  { metric: "Efficiency", current: 80, previous: 72 },
]

const chartConfig = {
  current: { label: "Current", color: "var(--chart-1)" },
  previous: { label: "Previous", color: "var(--chart-4)" },
} satisfies ChartConfig

export function ChartRadarCapabilities() {
  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Agent Capabilities</CardTitle>
        <CardDescription>Performance across key dimensions</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px] [&_.recharts-surface]:overflow-visible">
          <RadarChart data={chartData} outerRadius="65%" margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <PolarGrid />
            <Radar
              dataKey="previous"
              fill="var(--color-previous)"
              fillOpacity={0.15}
              stroke="var(--color-previous)"
              strokeWidth={1}
            />
            <Radar
              dataKey="current"
              fill="var(--color-current)"
              fillOpacity={0.25}
              stroke="var(--color-current)"
              strokeWidth={2}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none">
          Overall improvement +14% <IconTrendingUp className="size-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Comparing current vs previous quarter
        </div>
      </CardFooter>
    </Card>
  )
}

"use client"

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  data: { avgDurationMs: number; totalRuns: number; approvalRate: number; avgTokensOut: number }
  loading?: boolean
}

const chartConfig = {
  value: { label: "Score", color: "var(--chart-1)" },
} satisfies ChartConfig

export function ChartRadarCapabilities({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  // Normalize metrics to 0-100 scale
  const speedScore = data.avgDurationMs > 0 ? Math.min(100, Math.round(10000 / data.avgDurationMs * 10)) : 0
  const volumeScore = Math.min(100, Math.round(data.totalRuns / 10 * 100))
  const approvalScore = data.approvalRate
  const efficiencyScore = data.avgTokensOut > 0 ? Math.min(100, Math.round(5000 / data.avgTokensOut * 10)) : 0

  const chartData = [
    { metric: "Speed", value: speedScore },
    { metric: "Volume", value: volumeScore },
    { metric: "Autonomy", value: approvalScore },
    { metric: "Efficiency", value: efficiencyScore },
    { metric: "Coverage", value: Math.min(100, Math.round((speedScore + volumeScore + approvalScore + efficiencyScore) / 4)) },
  ]

  const allZero = chartData.every(d => d.value === 0)

  if (allZero) {
    return (
      <Card>
        <CardHeader className="items-center"><CardTitle>Agent Performance</CardTitle></CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
          No performance data yet
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Agent Performance</CardTitle>
        <CardDescription>Normalized metrics across dimensions</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px] [&_.recharts-surface]:overflow-visible">
          <RadarChart data={chartData} outerRadius="65%" margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <PolarGrid />
            <Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.25} stroke="var(--color-value)" strokeWidth={2} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          {data.totalRuns} total runs, {data.avgDurationMs}ms avg
        </div>
      </CardFooter>
    </Card>
  )
}

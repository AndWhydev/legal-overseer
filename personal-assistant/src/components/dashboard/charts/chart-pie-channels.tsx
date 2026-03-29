"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  data: { channel: string; count: number }[]
  totalMessages?: number
  loading?: boolean
}

const CHANNEL_COLORS: Record<string, string> = {
  gmail: "var(--chart-1)",
  outlook: "var(--chart-2)",
  whatsapp: "var(--chart-3)",
  imessage: "var(--chart-4)",
  sms: "var(--chart-5)",
  slack: "var(--chart-1)",
  calendar: "var(--chart-2)",
  reminders: "var(--chart-3)",
}

const CHANNEL_LABELS: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  whatsapp: "WhatsApp",
  imessage: "iMessage",
  sms: "SMS",
  slack: "Slack",
  calendar: "Calendar",
  reminders: "Reminders",
}

export function ChartPieChannels({ data, totalMessages, loading }: Props) {
  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  const total = totalMessages ?? data.reduce((sum, d) => sum + d.count, 0)

  const chartConfig: ChartConfig = { count: { label: "Messages" } }
  const chartData = data.map(d => {
    const label = CHANNEL_LABELS[d.channel] ?? d.channel
    chartConfig[d.channel] = { label, color: CHANNEL_COLORS[d.channel] ?? "var(--chart-5)" }
    return { channel: d.channel, count: d.count, fill: `var(--color-${d.channel})` }
  })

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader className="items-center"><CardTitle>Channel Distribution</CardTitle></CardHeader>
        <CardContent className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">
          No message data yet
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Channel Distribution</CardTitle>
        <CardDescription>Messages by source</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie data={chartData} dataKey="count" nameKey="channel" innerRadius={60} outerRadius={85} strokeWidth={5}>
              <Label content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  const cy = (viewBox.cy ?? 0) - 12
                  return (
                    <text x={viewBox.cx} y={cy} textAnchor="middle">
                      <tspan x={viewBox.cx} dy="0" className="fill-foreground text-3xl font-bold">{total.toLocaleString()}</tspan>
                      <tspan x={viewBox.cx} dy="1.4em" className="fill-muted-foreground text-xs">total</tspan>
                    </text>
                  )
                }
              }} />
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="channel" />} className="-translate-y-2 flex-wrap gap-2" />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          {data[0] ? `${CHANNEL_LABELS[data[0].channel] ?? data[0].channel} is the top channel` : ''}
        </div>
      </CardFooter>
    </Card>
  )
}

"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

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
  { channel: "email", messages: 1420, fill: "var(--color-email)" },
  { channel: "whatsapp", messages: 890, fill: "var(--color-whatsapp)" },
  { channel: "sms", messages: 340, fill: "var(--color-sms)" },
  { channel: "web", messages: 560, fill: "var(--color-web)" },
  { channel: "social", messages: 275, fill: "var(--color-social)" },
]

const chartConfig = {
  messages: { label: "Messages" },
  email: { label: "Email", color: "var(--chart-1)" },
  whatsapp: { label: "WhatsApp", color: "var(--chart-2)" },
  sms: { label: "SMS", color: "var(--chart-3)" },
  web: { label: "Web Chat", color: "var(--chart-4)" },
  social: { label: "Social", color: "var(--chart-5)" },
} satisfies ChartConfig

export function ChartPieChannels() {
  const total = React.useMemo(
    () => chartData.reduce((sum, d) => sum + d.messages, 0),
    []
  )

  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Channel Distribution</CardTitle>
        <CardDescription>Messages by source this month</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={chartData}
              dataKey="messages"
              nameKey="channel"
              innerRadius={60}
              outerRadius={85}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 8} className="fill-foreground text-3xl font-bold">
                          {total.toLocaleString()}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-sm">
                          Messages
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="channel" />} className="-translate-y-2 flex-wrap gap-2" />
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none">
          Up 18% from last month <IconTrendingUp className="size-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Email remains the primary channel
        </div>
      </CardFooter>
    </Card>
  )
}

"use client"

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

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
  { category: "Inbox", completed: 186, pending: 80 },
  { category: "Leads", completed: 305, pending: 200 },
  { category: "Invoices", completed: 237, pending: 120 },
  { category: "Content", completed: 73, pending: 190 },
  { category: "Admin", completed: 209, pending: 130 },
  { category: "Support", completed: 214, pending: 140 },
]

const chartConfig = {
  completed: { label: "Completed", color: "var(--chart-1)" },
  pending: { label: "Pending", color: "var(--chart-4)" },
} satisfies ChartConfig

export function ChartBarTasks() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Tasks by Category</CardTitle>
        <CardDescription>Completed vs pending across workflows</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pending" fill="var(--color-pending)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

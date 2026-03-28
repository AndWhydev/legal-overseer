"use client"

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"

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
  type ChartConfig,
} from "@/components/ui/chart"

const goalsData = [
  {
    label: "Tasks",
    value: 78,
    fill: "var(--chart-1)",
    description: "312 of 400 target",
  },
  {
    label: "Revenue",
    value: 92,
    fill: "var(--chart-2)",
    description: "$9,200 of $10,000",
  },
  {
    label: "Engagement",
    value: 65,
    fill: "var(--chart-4)",
    description: "65% response rate",
  },
  {
    label: "Uptime",
    value: 99,
    fill: "var(--chart-1)",
    description: "99.7% this month",
  },
]

const chartConfig = {
  value: { label: "Progress" },
  tasks: { label: "Tasks", color: "var(--chart-1)" },
  revenue: { label: "Revenue", color: "var(--chart-2)" },
  engagement: { label: "Engagement", color: "var(--chart-4)" },
  uptime: { label: "Uptime", color: "var(--chart-1)" },
} satisfies ChartConfig

function RadialGoal({ label, value, fill, description }: typeof goalsData[number]) {
  const data = [{ value, fill }]
  const endAngle = (value / 100) * 360

  return (
    <div className="flex flex-col items-center gap-1">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[100px] w-[100px]">
        <RadialBarChart
          data={data}
          startAngle={0}
          endAngle={endAngle}
          innerRadius={35}
          outerRadius={48}
        >
          <PolarGrid
            gridType="circle"
            radialLines={false}
            stroke="none"
            className="first:fill-muted last:fill-background"
            polarRadius={[38, 32]}
          />
          <RadialBar dataKey="value" background cornerRadius={10} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-lg font-bold">
                        {value}%
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </div>
  )
}

export function ChartRadialGoals() {
  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center">
        <CardTitle>Monthly Goals</CardTitle>
        <CardDescription>Progress toward key targets</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 gap-4">
          {goalsData.map((goal) => (
            <RadialGoal key={goal.label} {...goal} />
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          3 of 4 goals on track this month
        </div>
      </CardFooter>
    </Card>
  )
}

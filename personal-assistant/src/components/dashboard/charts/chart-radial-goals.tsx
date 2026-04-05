"use client"

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"

interface Props {
  data: {
    tasksCompleted: number; tasksTotal: number
    revenuePaid: number; revenueTotal: number
    messagesActionable: number; messagesTotal: number
    agentSuccess: number; agentTotal: number
  }
  loading?: boolean
}

const chartConfig = {
  value: { label: "Progress" },
} satisfies ChartConfig

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

function RadialGoal({ label, value, fill, description }: { label: string; value: number; fill: string; description: string }) {
  const data = [{ value, fill }]
  const endAngle = (value / 100) * 360

  return (
    <div className="flex flex-col items-center gap-1">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[100px] w-[100px]">
        <RadialBarChart data={data} startAngle={0} endAngle={endAngle} innerRadius={35} outerRadius={48}>
          <PolarGrid gridType="circle" radialLines={false} stroke="none" className="first:fill-muted last:fill-background" polarRadius={[38, 32]} />
          <RadialBar dataKey="value" background cornerRadius={10} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-lg font-medium">{value}%</tspan>
                  </text>
                )
              }
            }} />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
  )
}

export function ChartRadialGoals({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-[350px] w-full rounded-xl" />

  const goals = [
    { label: "Tasks", value: pct(data.tasksCompleted, data.tasksTotal), fill: "var(--chart-1)", description: `${data.tasksCompleted} of ${data.tasksTotal}` },
    { label: "Revenue", value: pct(data.revenuePaid, data.revenueTotal), fill: "var(--chart-2)", description: `${pct(data.revenuePaid, data.revenueTotal)}% collected` },
    { label: "Actionable", value: pct(data.messagesActionable, data.messagesTotal), fill: "var(--chart-4)", description: `${data.messagesActionable} of ${data.messagesTotal} msgs` },
    { label: "Agent Success", value: pct(data.agentSuccess, data.agentTotal), fill: "var(--chart-1)", description: `${data.agentSuccess} of ${data.agentTotal} runs` },
  ]

  const onTrack = goals.filter(g => g.value >= 50).length

  return (
    <Card className="@container/card flex flex-col">
      <CardHeader className="items-center">
        <CardTitle>Goals</CardTitle>
        <CardDescription>Progress across key metrics</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid grid-cols-2 gap-4">
          {goals.map(goal => <RadialGoal key={goal.label} {...goal} />)}
        </div>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="leading-none text-muted-foreground">
          {onTrack} of {goals.length} metrics on track
        </div>
      </CardFooter>
    </Card>
  )
}

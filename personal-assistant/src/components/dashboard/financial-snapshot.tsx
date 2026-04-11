'use client'

import React from 'react'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Snapshot = {
  totalInvoiced: number; totalPaid: number; overdue: number; pending: number; outstanding: number
  timeline: { month: string; invoiced: number; received: number }[]
}

const chartConfig = {
  invoiced: { label: 'Invoiced', color: 'var(--foreground)' },
  received: { label: 'Received', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

export function FinancialSnapshot() {
  const { data, isLoading } = useSWR<Snapshot>('/api/dashboard/financial-snapshot', fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  })

  if (isLoading || !data) {
    return <Card><CardHeader><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16 mt-1" /></CardHeader><CardContent><Skeleton className="h-[120px] w-full" /></CardContent></Card>
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Financial</CardTitle>
        <CardDescription className="text-sm">${data.totalInvoiced.toLocaleString()} invoiced, ${data.totalPaid.toLocaleString()} received</CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {data.timeline.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[100px] w-full">
            <AreaChart data={data.timeline} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.3} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={4} tick={{ fontSize: 14, fill: 'var(--muted-foreground)' }} tickFormatter={(v: string) => v.slice(5)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="invoiced" type="monotone" fill="var(--foreground)" fillOpacity={0.08} stroke="var(--foreground)" strokeOpacity={0.4} strokeWidth={1.5} />
              <Area dataKey="received" type="monotone" fill="var(--muted-foreground)" fillOpacity={0.05} stroke="var(--muted-foreground)" strokeOpacity={0.3} strokeWidth={1} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="text-sm text-muted-foreground py-4">No invoice data yet</div>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground gap-3">
        <span>${data.outstanding.toLocaleString()} outstanding</span>
        {data.overdue > 0 && <span>{data.overdue} overdue</span>}
        {data.pending > 0 && <span>{data.pending} pending</span>}
      </CardFooter>
    </Card>
  )
}

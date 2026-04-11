'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ChartData {
  // Area chart: agent runs by day (last 90 days)
  agentActivity: { date: string; scheduled: number; webhook: number; manual: number }[]
  // Bar chart: tasks by status
  tasksByStatus: { status: string; count: number }[]
  // Line chart: avg agent duration by month
  responseTimesMonthly: { month: string; avgMs: number }[]
  // Pie chart: messages by channel
  channelDistribution: { channel: string; count: number }[]
  // Radial chart: goal completion
  goals: {
    tasksCompleted: number; tasksTotal: number
    revenuePaid: number; revenueTotal: number
    messagesActionable: number; messagesTotal: number
    agentSuccess: number; agentTotal: number
  }
  // Exact counts from Supabase (not limited by row fetch)
  totalMessages: number
  totalActionableMessages: number
  // Radar chart: agent performance
  agentPerformance: {
    avgDurationMs: number
    totalRuns: number
    approvalRate: number
    avgTokensOut: number
  }
}

const EMPTY: ChartData = {
  agentActivity: [],
  tasksByStatus: [],
  responseTimesMonthly: [],
  channelDistribution: [],
  totalMessages: 0,
  totalActionableMessages: 0,
  goals: { tasksCompleted: 0, tasksTotal: 0, revenuePaid: 0, revenueTotal: 0, messagesActionable: 0, messagesTotal: 0, agentSuccess: 0, agentTotal: 0 },
  agentPerformance: { avgDurationMs: 0, totalRuns: 0, approvalRate: 0, avgTokensOut: 0 },
}

export function useChartData() {
  const [data, setData] = useState<ChartData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }
    const db = supabase

    async function fetchAll() {
      try {
        const now = new Date()
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

        const [
          agentRunsRes,
          tasksRes,
          messagesRes,
          invoicesRes,
          msgCountRes,
          msgActionableCountRes,
        ] = await Promise.all([
          db.from('agent_runs').select('created_at, trigger_type, duration_ms, tokens_out, routing_decision').gte('created_at', ninetyDaysAgo).order('created_at', { ascending: true }).limit(5000),
          db.from('tasks').select('status, priority, created_at').limit(2000),
          db.from('channel_messages').select('channel, is_actionable, received_at').limit(5000),
          db.from('invoices').select('status, amount').limit(2000),
          db.from('channel_messages').select('*', { count: 'exact', head: true }),
          db.from('channel_messages').select('*', { count: 'exact', head: true }).eq('is_actionable', true),
        ])

        const agentRuns = agentRunsRes.data ?? []
        const tasks = tasksRes.data ?? []
        const messages = messagesRes.data ?? []
        const invoices = invoicesRes.data ?? []

        // Area chart: group agent runs by date and trigger type
        const dateMap = new Map<string, { scheduled: number; webhook: number; manual: number }>()
        for (const run of agentRuns) {
          const date = (run.created_at as string).split('T')[0]
          const bucket = dateMap.get(date) ?? { scheduled: 0, webhook: 0, manual: 0 }
          const type = (run.trigger_type as string) ?? 'manual'
          if (type === 'scheduled') bucket.scheduled++
          else if (type === 'webhook') bucket.webhook++
          else bucket.manual++
          dateMap.set(date, bucket)
        }
        const agentActivity = Array.from(dateMap.entries())
          .map(([date, counts]) => ({ date, ...counts }))
          .sort((a, b) => a.date.localeCompare(b.date))

        // Bar chart: tasks grouped by status
        const statusCounts = new Map<string, number>()
        for (const task of tasks) {
          const s = (task.status as string) ?? 'pending'
          statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
        }
        const tasksByStatus = Array.from(statusCounts.entries())
          .map(([status, count]) => ({ status, count }))

        // Line chart: average agent duration by month
        const monthDurations = new Map<string, { sum: number; count: number }>()
        for (const run of agentRuns) {
          if (!run.duration_ms) continue
          const month = (run.created_at as string).slice(0, 7) // YYYY-MM
          const bucket = monthDurations.get(month) ?? { sum: 0, count: 0 }
          bucket.sum += run.duration_ms as number
          bucket.count++
          monthDurations.set(month, bucket)
        }
        const responseTimesMonthly = Array.from(monthDurations.entries())
          .map(([month, { sum, count }]) => ({ month, avgMs: Math.round(sum / count) }))
          .sort((a, b) => a.month.localeCompare(b.month))

        // Pie chart: messages by channel
        const channelCounts = new Map<string, number>()
        for (const msg of messages) {
          const ch = (msg.channel as string) ?? 'unknown'
          channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1)
        }
        const channelDistribution = Array.from(channelCounts.entries())
          .map(([channel, count]) => ({ channel, count }))
          .sort((a, b) => b.count - a.count)

        // Radial goals — use exact counts from Supabase for messages
        const tasksCompleted = tasks.filter(t => t.status === 'completed').length
        const tasksTotal = tasks.length || 1
        const revenuePaid = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (i.amount ?? 0), 0)
        const revenueTotal = invoices.reduce((s: number, i: any) => s + (i.amount ?? 0), 0) || 1
        const messagesActionable = (msgActionableCountRes as any).count ?? messages.filter(m => m.is_actionable).length
        const messagesTotal = ((msgCountRes as any).count ?? messages.length) || 1
        const agentSuccess = agentRuns.filter(r => r.routing_decision === 'act').length
        const agentTotal = agentRuns.length || 1

        // Radar performance
        const durations = agentRuns.filter(r => r.duration_ms).map(r => r.duration_ms as number)
        const avgDurationMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
        const tokensOut = agentRuns.filter(r => r.tokens_out).map(r => r.tokens_out as number)
        const avgTokensOut = tokensOut.length ? Math.round(tokensOut.reduce((a, b) => a + b, 0) / tokensOut.length) : 0
        const approvedRuns = agentRuns.filter(r => r.routing_decision === 'act').length

        setData({
          agentActivity,
          tasksByStatus,
          responseTimesMonthly,
          channelDistribution,
          totalMessages: (msgCountRes as any).count ?? messages.length,
          totalActionableMessages: (msgActionableCountRes as any).count ?? messagesActionable,
          goals: { tasksCompleted, tasksTotal, revenuePaid, revenueTotal, messagesActionable, messagesTotal, agentSuccess, agentTotal },
          agentPerformance: { avgDurationMs, totalRuns: agentRuns.length, approvalRate: agentRuns.length ? Math.round((approvedRuns / agentRuns.length) * 100) : 0, avgTokensOut },
        })
      } catch (err) {
        console.error('[useChartData] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  return { data, loading }
}

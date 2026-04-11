import { NextResponse } from 'next/server'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CohortWeek {
  cohortLabel: string  // e.g. "2026-W01"
  cohortStart: string  // ISO date
  orgCount: number
  retention: number[]  // index = weeks since signup, value = % orgs still active
}

export interface CohortMatrix {
  cohorts: CohortWeek[]
  maxWeeks: number
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addWeeks(date: Date, n: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + n * 7)
  return d
}

// ---------------------------------------------------------------------------
// GET /api/analytics/cohorts
// ---------------------------------------------------------------------------

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const client = await createClient()
  if (!client) {
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }

  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all orgs with their creation date (signup cohort)
    const { data: orgs, error: orgsError } = await client
      .from('organisations')
      .select('id, created_at')
      .order('created_at', { ascending: true })

    if (orgsError) throw orgsError
    if (!orgs || orgs.length === 0) {
      return NextResponse.json({
        cohorts: [],
        maxWeeks: 0,
        generatedAt: new Date().toISOString(),
      } satisfies CohortMatrix)
    }

    // Determine the 12-week lookback window
    const now = new Date()
    const lookbackStart = new Date(now)
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 12 * 7)

    // Fetch activity signals (channel_messages + tasks) to determine "active" status
    // An org is "active" in a given week if it has any messages or task updates in that week
    const [messagesResult, tasksResult] = await Promise.all([
      client
        .from('channel_messages')
        .select('org_id, created_at')
        .gte('created_at', lookbackStart.toISOString()),
      client
        .from('tasks')
        .select('org_id, updated_at')
        .gte('updated_at', lookbackStart.toISOString()),
    ])

    // Build activity index: orgId -> Set of week labels where they were active
    const activityMap = new Map<string, Set<string>>()

    for (const msg of messagesResult.data ?? []) {
      const orgId = msg.org_id as string
      const weekLabel = isoWeekLabel(new Date(msg.created_at as string))
      if (!activityMap.has(orgId)) activityMap.set(orgId, new Set())
      activityMap.get(orgId)!.add(weekLabel)
    }

    for (const task of tasksResult.data ?? []) {
      const orgId = task.org_id as string
      const weekLabel = isoWeekLabel(new Date(task.updated_at as string))
      if (!activityMap.has(orgId)) activityMap.set(orgId, new Set())
      activityMap.get(orgId)!.add(weekLabel)
    }

    // Group orgs into weekly cohorts
    type CohortEntry = { cohortStart: Date; cohortLabel: string; orgIds: string[] }
    const cohortMap = new Map<string, CohortEntry>()

    for (const org of orgs) {
      const signupDate = new Date(org.created_at as string)
      const weekStart = startOfWeek(signupDate)
      const label = isoWeekLabel(signupDate)

      if (!cohortMap.has(label)) {
        cohortMap.set(label, { cohortStart: weekStart, cohortLabel: label, orgIds: [] })
      }
      cohortMap.get(label)!.orgIds.push(org.id as string)
    }

    // Compute retention for each cohort — up to 8 weeks out
    const MAX_WEEKS = 8
    const cohorts: CohortWeek[] = []

    for (const [, entry] of cohortMap) {
      if (entry.orgIds.length === 0) continue

      const retention: number[] = []

      for (let w = 0; w <= MAX_WEEKS; w++) {
        const weekStart = addWeeks(entry.cohortStart, w)
        const weekLabel = isoWeekLabel(weekStart)

        // Week 0 = signup week, always 100%
        if (w === 0) {
          retention.push(100)
          continue
        }

        // Count orgs active in this week
        const activeCount = entry.orgIds.filter((id) => {
          const weeks = activityMap.get(id)
          return weeks?.has(weekLabel) ?? false
        }).length

        const pct = Math.round((activeCount / entry.orgIds.length) * 100)
        retention.push(pct)
      }

      cohorts.push({
        cohortLabel: entry.cohortLabel,
        cohortStart: entry.cohortStart.toISOString().slice(0, 10),
        orgCount: entry.orgIds.length,
        retention,
      })
    }

    // Sort cohorts chronologically
    cohorts.sort((a, b) => a.cohortStart.localeCompare(b.cohortStart))

    // Keep only the most recent 12 cohort weeks
    const recent = cohorts.slice(-12)

    return NextResponse.json({
      cohorts: recent,
      maxWeeks: MAX_WEEKS,
      generatedAt: new Date().toISOString(),
    } satisfies CohortMatrix)
  } catch (err) {
    logger.error('[analytics/cohorts] error:', err)
    return NextResponse.json(
      { error: 'Cohort query failed', details: String(err) },
      { status: 500 },
    )
  }
}

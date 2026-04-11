import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapacityAssessment {
  utilizationPercent: number // 0-100+
  status: 'under' | 'optimal' | 'heavy' | 'overloaded'
  activeProjects: number
  activeTasks: number
  upcomingDeadlines: DeadlineInfo[]
  alerts: CapacityAlert[]
  suggestions: CapacitySuggestion[]
  gatheringData: boolean
  computedAt: string
}

export interface DeadlineInfo {
  entityType: 'project' | 'task'
  entityId: string
  name: string
  dueDate: string
  daysUntilDue: number
  contactName: string | null
}

export interface CapacityAlert {
  type: 'overcommitted' | 'deadline_cluster' | 'idle' | 'unbalanced'
  summary: string
  severity: 'high' | 'medium' | 'low'
  details: Record<string, unknown>
}

export interface CapacitySuggestion {
  type: 'defer_start' | 'redistribute' | 'take_on_more' | 'warn_client'
  summary: string
  details: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum active projects/tasks before capacity assessment is meaningful */
const MIN_ACTIVE_ITEMS = 1

/** "Optimal" range for concurrent active projects */
const OPTIMAL_PROJECT_MIN = 2
const OPTIMAL_PROJECT_MAX = 5

/** Max tasks per week before overcommitment warning */
const MAX_WEEKLY_TASKS = 15

/** Days ahead to scan for deadline clusters */
const DEADLINE_SCAN_DAYS = 14

/** Cache metric type for bi_snapshots */
const CACHE_METRIC_TYPE = 'capacity_oracle'

/** Cache TTL: 6 hours (capacity changes more frequently) */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Main: Assess Capacity
// ---------------------------------------------------------------------------

/**
 * Assess current workload capacity from active projects and tasks.
 * Warns on overcommitment, suggests start dates, identifies deadline clusters.
 * Caches in bi_snapshots with 6h TTL.
 */
export async function assessCapacity(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CapacityAssessment> {
  const tag = `[capacity-oracle:${orgId.slice(0, 8)}]`

  // Check cache
  const cached = await getCachedResult(supabase, orgId)
  if (cached) {
    logger.info(`${tag} Returning cached capacity assessment`)
    return cached
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // -------------------------------------------------------------------------
  // 1. Active projects
  // -------------------------------------------------------------------------
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, contact_id, due_date, created_at')
    .eq('org_id', orgId)
    .in('status', ['active', 'in_progress'])

  const activeProjects = projects ?? []

  // -------------------------------------------------------------------------
  // 2. Active/pending tasks
  // -------------------------------------------------------------------------
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, project_id, due_date, priority, created_at')
    .eq('org_id', orgId)
    .in('status', ['todo', 'in_progress', 'pending'])

  const activeTasks = tasks ?? []

  // Check minimum data threshold
  if (activeProjects.length + activeTasks.length < MIN_ACTIVE_ITEMS) {
    const result: CapacityAssessment = {
      utilizationPercent: 0,
      status: 'under',
      activeProjects: activeProjects.length,
      activeTasks: activeTasks.length,
      upcomingDeadlines: [],
      alerts: [],
      suggestions: [],
      gatheringData: true,
      computedAt: now.toISOString(),
    }
    await cacheResult(supabase, orgId, result)
    logger.info(`${tag} Gathering data: only ${activeProjects.length} projects + ${activeTasks.length} tasks`)
    return result
  }

  // -------------------------------------------------------------------------
  // 3. Fetch contact names for deadline display
  // -------------------------------------------------------------------------
  const contactIds = new Set<string>()
  for (const proj of activeProjects) {
    if (proj.contact_id) contactIds.add(proj.contact_id as string)
  }

  const contactNames: Record<string, string> = {}
  if (contactIds.size > 0) {
    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('org_id', orgId)
      .in('id', Array.from(contactIds))

    for (const c of contactData ?? []) {
      contactNames[c.id] = c.name as string
    }
  }

  // -------------------------------------------------------------------------
  // 4. Compute utilization
  // -------------------------------------------------------------------------
  // Simple model: projects contribute 20% each, tasks contribute 5% each
  const projectWeight = 20
  const taskWeight = 5
  const rawUtilization = (activeProjects.length * projectWeight) + (activeTasks.length * taskWeight)
  const utilizationPercent = Math.min(150, rawUtilization) // Cap at 150% for display

  let status: CapacityAssessment['status']
  if (utilizationPercent < 30) {
    status = 'under'
  } else if (utilizationPercent <= 80) {
    status = 'optimal'
  } else if (utilizationPercent <= 110) {
    status = 'heavy'
  } else {
    status = 'overloaded'
  }

  // -------------------------------------------------------------------------
  // 5. Upcoming deadlines (next 14 days)
  // -------------------------------------------------------------------------
  const deadlineCutoff = new Date(now.getTime() + DEADLINE_SCAN_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  const upcomingDeadlines: DeadlineInfo[] = []

  for (const proj of activeProjects) {
    const dueDate = proj.due_date as string
    if (dueDate && dueDate >= todayStr && dueDate <= deadlineCutoff) {
      const daysUntil = Math.ceil(
        (new Date(dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      upcomingDeadlines.push({
        entityType: 'project',
        entityId: proj.id as string,
        name: proj.name as string,
        dueDate,
        daysUntilDue: daysUntil,
        contactName: contactNames[proj.contact_id as string] ?? null,
      })
    }
  }

  for (const task of activeTasks) {
    const dueDate = task.due_date as string
    if (dueDate && dueDate >= todayStr && dueDate <= deadlineCutoff) {
      const daysUntil = Math.ceil(
        (new Date(dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      upcomingDeadlines.push({
        entityType: 'task',
        entityId: task.id as string,
        name: task.title as string,
        dueDate,
        daysUntilDue: daysUntil,
        contactName: null,
      })
    }
  }

  // Sort by soonest deadline
  upcomingDeadlines.sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  // -------------------------------------------------------------------------
  // 6. Generate alerts
  // -------------------------------------------------------------------------
  const alerts: CapacityAlert[] = []

  // Overcommitment
  if (activeProjects.length > OPTIMAL_PROJECT_MAX) {
    alerts.push({
      type: 'overcommitted',
      summary: `${activeProjects.length} active projects (optimal: ${OPTIMAL_PROJECT_MIN}-${OPTIMAL_PROJECT_MAX}). Risk of quality degradation.`,
      severity: activeProjects.length > OPTIMAL_PROJECT_MAX * 1.5 ? 'high' : 'medium',
      details: {
        activeProjects: activeProjects.length,
        optimalMax: OPTIMAL_PROJECT_MAX,
      },
    })
  }

  // Task overload
  if (activeTasks.length > MAX_WEEKLY_TASKS) {
    alerts.push({
      type: 'overcommitted',
      summary: `${activeTasks.length} active tasks exceeds weekly capacity of ${MAX_WEEKLY_TASKS}`,
      severity: 'high',
      details: {
        activeTasks: activeTasks.length,
        maxWeekly: MAX_WEEKLY_TASKS,
      },
    })
  }

  // Deadline cluster (3+ deadlines in same 3-day window)
  const deadlineWindows: Record<string, DeadlineInfo[]> = {}
  for (const dl of upcomingDeadlines) {
    // Group into 3-day windows
    const windowKey = `${Math.floor(dl.daysUntilDue / 3)}`
    if (!deadlineWindows[windowKey]) deadlineWindows[windowKey] = []
    deadlineWindows[windowKey].push(dl)
  }

  for (const [, deadlines] of Object.entries(deadlineWindows)) {
    if (deadlines.length >= 3) {
      const earliest = deadlines[0]
      alerts.push({
        type: 'deadline_cluster',
        summary: `${deadlines.length} deadlines clustered around ${earliest.dueDate} (within 3 days)`,
        severity: deadlines.length >= 5 ? 'high' : 'medium',
        details: {
          count: deadlines.length,
          dates: deadlines.map((d) => ({ name: d.name, dueDate: d.dueDate })),
        },
      })
    }
  }

  // Idle capacity
  if (status === 'under' && activeProjects.length < OPTIMAL_PROJECT_MIN) {
    alerts.push({
      type: 'idle',
      summary: `Only ${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''} -- capacity available for more work`,
      severity: 'low',
      details: {
        activeProjects: activeProjects.length,
        optimalMin: OPTIMAL_PROJECT_MIN,
      },
    })
  }

  // -------------------------------------------------------------------------
  // 7. Generate suggestions
  // -------------------------------------------------------------------------
  const suggestions: CapacitySuggestion[] = []

  if (status === 'overloaded') {
    suggestions.push({
      type: 'defer_start',
      summary: 'Consider deferring start on new projects until current workload reduces',
      details: {
        currentUtilization: utilizationPercent,
        activeProjects: activeProjects.length,
      },
    })
  }

  if (status === 'under') {
    suggestions.push({
      type: 'take_on_more',
      summary: `Capacity available: ${activeProjects.length}/${OPTIMAL_PROJECT_MAX} projects. Good time for new client outreach.`,
      details: {
        availableSlots: OPTIMAL_PROJECT_MAX - activeProjects.length,
      },
    })
  }

  // Overdue deadline warning
  const overdueDeadlines = upcomingDeadlines.filter((d) => d.daysUntilDue <= 0)
  if (overdueDeadlines.length > 0) {
    suggestions.push({
      type: 'warn_client',
      summary: `${overdueDeadlines.length} overdue deadline${overdueDeadlines.length > 1 ? 's' : ''} -- consider proactive client communication`,
      details: {
        overdue: overdueDeadlines.map((d) => d.name),
      },
    })
  }

  const result: CapacityAssessment = {
    utilizationPercent,
    status,
    activeProjects: activeProjects.length,
    activeTasks: activeTasks.length,
    upcomingDeadlines: upcomingDeadlines.slice(0, 10), // Top 10
    alerts,
    suggestions,
    gatheringData: false,
    computedAt: now.toISOString(),
  }

  await cacheResult(supabase, orgId, result)

  logger.info(
    `${tag} Capacity: ${utilizationPercent}% (${status}), ` +
    `${activeProjects.length} projects, ${activeTasks.length} tasks, ` +
    `${upcomingDeadlines.length} deadlines, ${alerts.length} alerts`,
  )

  return result
}

// ---------------------------------------------------------------------------
// Cache Helpers (bi_snapshots)
// ---------------------------------------------------------------------------

async function getCachedResult(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CapacityAssessment | null> {
  try {
    const { data } = await supabase
      .from('bi_snapshots')
      .select('data, expires_at')
      .eq('org_id', orgId)
      .eq('metric_type', CACHE_METRIC_TYPE)
      .single()

    if (!data) return null

    const expiresAt = new Date(data.expires_at as string)
    if (expiresAt <= new Date()) return null

    return data.data as CapacityAssessment
  } catch {
    return null
  }
}

async function cacheResult(
  supabase: SupabaseClient,
  orgId: string,
  result: CapacityAssessment,
): Promise<void> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString()

    await supabase.from('bi_snapshots').upsert(
      {
        org_id: orgId,
        metric_type: CACHE_METRIC_TYPE,
        data: result,
        computed_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'org_id,metric_type' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn(`[capacity-oracle] Cache write failed: ${message}`)
  }
}

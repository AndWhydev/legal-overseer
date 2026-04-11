import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

export interface LifecycleAction {
  projectId: string
  projectName: string
  action: 'advance_phase' | 'generate_invoice' | 'close_project' | 'flag_stale'
  reason: string
  confidence: number
}

export async function evaluateProjectLifecycles(
  supabase: SupabaseClient,
  orgId: string,
): Promise<LifecycleAction[]> {
  const actions: LifecycleAction[] = []

  // Get active projects with their entity_nodes data
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, metadata, contact_id, updated_at')
    .eq('org_id', orgId)
    .in('status', ['active', 'blocked', 'pending_invoice'])

  if (!projects?.length) return actions

  const now = new Date()

  for (const project of projects) {
    const meta = (project.metadata || {}) as Record<string, unknown>
    const phases = (meta.phases || []) as Array<{ name: string; status: string; completed_at?: string }>
    const currentPhase = phases.find(p => p.status === 'active')
    const daysSinceUpdate = (now.getTime() - new Date(project.updated_at).getTime()) / 86400000

    // Rule 1: Project with all phases complete → generate invoice
    const allPhasesComplete = phases.length > 0 && phases.every(p => p.status === 'completed')
    if (allPhasesComplete && project.status === 'active') {
      actions.push({
        projectId: project.id,
        projectName: project.name,
        action: 'generate_invoice',
        reason: `All ${phases.length} phases completed. Ready to invoice.`,
        confidence: 0.85,
      })
    }

    // Rule 2: Project with pending_invoice status for >7 days → flag stale
    if (project.status === 'pending_invoice' && daysSinceUpdate > 7) {
      actions.push({
        projectId: project.id,
        projectName: project.name,
        action: 'flag_stale',
        reason: `Invoice pending for ${Math.floor(daysSinceUpdate)} days.`,
        confidence: 0.9,
      })
    }

    // Rule 3: Active project not updated in 14+ days → flag stale
    if (project.status === 'active' && daysSinceUpdate > 14 && !currentPhase) {
      actions.push({
        projectId: project.id,
        projectName: project.name,
        action: 'flag_stale',
        reason: `No activity for ${Math.floor(daysSinceUpdate)} days, no active phase.`,
        confidence: 0.8,
      })
    }

    // Rule 4: Blocked project with blocker resolved (no more blocked_by edges) → advance
    if (project.status === 'blocked') {
      // Check entity graph for unresolved blockers
      const { data: entityNode } = await supabase
        .from('entity_nodes')
        .select('id')
        .eq('org_id', orgId)
        .eq('entity_type', 'project')
        .ilike('name', `%${project.name}%`)
        .limit(1)
        .single()

      if (entityNode) {
        const { data: blockerEdges } = await supabase
          .from('entity_edges')
          .select('id')
          .eq('source_id', entityNode.id)
          .ilike('relation_type', '%block%')
          .is('valid_until', null)
          .limit(1)

        if (!blockerEdges?.length) {
          actions.push({
            projectId: project.id,
            projectName: project.name,
            action: 'advance_phase',
            reason: 'All blockers resolved. Ready to resume.',
            confidence: 0.75,
          })
        }
      }
    }
  }

  return actions
}

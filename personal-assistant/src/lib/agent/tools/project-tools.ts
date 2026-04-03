import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const projectToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'list_projects',
    description: 'List active and blocked projects for the org. Shows phases, current status, blockers, and next actions. Use when asked about project status, what we are working on, or priorities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: active, blocked, completed, all. Default: active+blocked.',
          enum: ['active', 'blocked', 'completed', 'all'],
        },
        contact_name: {
          type: 'string',
          description: 'Optional: filter projects by client/contact name.',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_project',
    description: 'Update a project phase status, set next action, add/remove blockers, or change priority. Use when the user reports progress, resolves a blocker, or reprioritizes work.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name or partial name of the project to update.',
        },
        phase_id: {
          type: 'string',
          description: 'Optional: ID of the phase to update status for.',
        },
        phase_status: {
          type: 'string',
          description: 'New status for the phase.',
          enum: ['pending', 'active', 'complete', 'blocked'],
        },
        next_action: {
          type: 'string',
          description: 'Set the next action for this project.',
        },
        next_action_due: {
          type: 'string',
          description: 'ISO date for when the next action is due.',
        },
        add_blocker: {
          type: 'string',
          description: 'Add a blocker description.',
        },
        remove_blocker: {
          type: 'string',
          description: 'Remove a blocker by description (partial match).',
        },
        priority: {
          type: 'string',
          description: 'Set project priority.',
          enum: ['low', 'medium', 'high', 'critical'],
        },
        status: {
          type: 'string',
          description: 'Set overall project status.',
          enum: ['active', 'blocked', 'completed', 'paused'],
        },
      },
      required: ['project_name'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project to track work for a client. Use when starting a new engagement or when the user mentions a new piece of work that should be tracked.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Project name (e.g. Steve West — Website Rebuild)' },
        description: { type: 'string', description: 'What this project is about.' },
        contact_name: { type: 'string', description: 'Client/contact name to link this project to.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        phases: {
          type: 'array',
          description: 'Optional initial phases.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        next_action: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type ToolResult = { success: boolean; data?: unknown; error?: string }

async function handleListProjects(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const statusFilter = (input.status as string) || 'active'

  let query = supabase
    .from('projects')
    .select('id, name, status, contact_id, metadata, created_at, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (statusFilter !== 'all') {
    if (statusFilter === 'active') {
      query = query.in('status', ['active', 'blocked'])
    } else {
      query = query.eq('status', statusFilter)
    }
  }

  const { data: projects, error } = await query
  if (error) return { success: false, error: error.message }

  const formatted = (projects ?? []).map(p => {
    const meta = (p.metadata ?? {}) as Record<string, unknown>
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      priority: meta.priority || 'medium',
      current_phase: meta.current_phase || null,
      next_action: meta.next_action || null,
      next_action_due: meta.next_action_due || null,
      blockers: meta.blockers || [],
      phases: (Array.isArray(meta.phases) ? meta.phases : []).map((ph: Record<string, unknown>) => ({
        id: ph.id,
        title: ph.title,
        status: ph.status,
      })),
      total_invoiced: meta.total_invoiced || 0,
      total_paid: meta.total_paid || 0,
    }
  })

  return { success: true, data: { projects: formatted, count: formatted.length } }
}

async function handleUpdateProject(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const projectName = input.project_name as string
  if (!projectName) return { success: false, error: 'project_name is required' }

  const { data: matches } = await supabase
    .from('projects')
    .select('id, name, metadata')
    .eq('org_id', orgId)
    .ilike('name', `%${projectName}%`)
    .limit(1)

  if (!matches || matches.length === 0) {
    return { success: false, error: `No project matching ${projectName} found` }
  }

  const project = matches[0]
  const meta = { ...((project.metadata ?? {}) as Record<string, unknown>) }
  const changes: string[] = []

  // Update phase status
  if (input.phase_id && input.phase_status) {
    const phases = Array.isArray(meta.phases) ? [...meta.phases] : []
    const phase = phases.find((ph: Record<string, unknown>) => ph.id === input.phase_id)
    if (phase) {
      phase.status = input.phase_status
      changes.push(`Phase ${phase.title} → ${input.phase_status}`)
    }
    meta.phases = phases
  }

  // Set next action
  if (input.next_action !== undefined) {
    meta.next_action = input.next_action
    changes.push(`Next action: ${input.next_action}`)
  }
  if (input.next_action_due !== undefined) {
    meta.next_action_due = input.next_action_due
  }

  // Add blocker
  if (input.add_blocker) {
    const blockers = Array.isArray(meta.blockers) ? [...meta.blockers] : []
    blockers.push({ description: input.add_blocker, since: new Date().toISOString().slice(0, 10), severity: 'medium' })
    meta.blockers = blockers
    changes.push(`Added blocker: ${input.add_blocker}`)
  }

  // Remove blocker
  if (input.remove_blocker) {
    const blockers = Array.isArray(meta.blockers) ? [...meta.blockers] : []
    const before = blockers.length
    meta.blockers = blockers.filter((b: Record<string, unknown>) =>
      !(b.description as string || '').toLowerCase().includes((input.remove_blocker as string).toLowerCase())
    )
    if ((meta.blockers as unknown[]).length < before) {
      changes.push(`Removed blocker matching ${input.remove_blocker}`)
    }
  }

  // Priority
  if (input.priority) {
    meta.priority = input.priority
    changes.push(`Priority → ${input.priority}`)
  }

  // Build update payload
  const update: Record<string, unknown> = { metadata: meta, updated_at: new Date().toISOString() }
  if (input.status) {
    update.status = input.status
    changes.push(`Status → ${input.status}`)
  }

  const { error } = await supabase
    .from('projects')
    .update(update)
    .eq('id', project.id)

  if (error) return { success: false, error: error.message }

  logger.info('[project-tools] Project updated', { projectId: project.id, changes })
  return { success: true, data: { project: project.name, changes } }
}

async function handleCreateProject(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const name = input.name as string
  const description = input.description as string
  if (!name || !description) return { success: false, error: 'name and description required' }

  // Resolve contact if provided
  let contactId: string | null = null
  if (input.contact_name) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', `%${input.contact_name}%`)
      .limit(1)
    contactId = contacts?.[0]?.id ?? null
  }

  const phases = Array.isArray(input.phases)
    ? input.phases.map((ph: Record<string, unknown>) => ({
        id: ph.id || (ph.title as string || '').toLowerCase().replace(/\s+/g, '-'),
        title: ph.title,
        description: ph.description || '',
        status: 'pending',
      }))
    : []

  const metadata = {
    priority: input.priority || 'medium',
    phases,
    current_phase: phases[0]?.id || null,
    blockers: [],
    next_action: input.next_action || null,
    total_invoiced: 0,
    total_paid: 0,
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      org_id: orgId,
      name,
      description,
      status: 'active',
      contact_id: contactId,
      metadata,
    })
    .select('id, name')
    .single()

  if (error) return { success: false, error: error.message }

  logger.info('[project-tools] Project created', { projectId: data.id, name })
  return { success: true, data: { id: data.id, name: data.name, phases: phases.length } }
}

// ---------------------------------------------------------------------------
// Handler map (matches tools.ts pattern)
// ---------------------------------------------------------------------------

export const projectToolHandlers: Record<
  string,
  (input: Record<string, unknown>, orgId: string, supabase: SupabaseClient) => Promise<ToolResult>
> = {
  list_projects: handleListProjects,
  update_project: handleUpdateProject,
  create_project: handleCreateProject,
}

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OnboardingChecklist {
  clientSlug: string
  projectType: string
  steps: OnboardingStep[]
  completedAt?: string
}

export interface OnboardingStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'complete' | 'blocked'
  notes?: string
}

const DEFAULT_STEPS: Record<string, OnboardingStep[]> = {
  website: [
    { id: 'welcome_email', label: 'Send welcome email package', status: 'pending' },
    { id: 'kickoff_call', label: 'Schedule kickoff call', status: 'pending' },
    { id: 'credentials', label: 'Request hosting/DNS/CMS credentials', status: 'pending' },
    { id: 'analytics', label: 'Set up GSC + Analytics access', status: 'pending' },
    { id: 'project_board', label: 'Create project task board', status: 'pending' },
    { id: 'timeline', label: 'Share project timeline', status: 'pending' },
  ],
  mobile_app: [
    { id: 'welcome_email', label: 'Send welcome email package', status: 'pending' },
    { id: 'kickoff_call', label: 'Schedule kickoff call', status: 'pending' },
    { id: 'nda', label: 'Sign NDA', status: 'pending' },
    { id: 'app_store', label: 'Request App Store / Play Store access', status: 'pending' },
    { id: 'design_assets', label: 'Collect branding / design assets', status: 'pending' },
    { id: 'project_board', label: 'Create project task board', status: 'pending' },
    { id: 'timeline', label: 'Share project timeline', status: 'pending' },
  ],
  default: [
    { id: 'welcome_email', label: 'Send welcome email package', status: 'pending' },
    { id: 'kickoff_call', label: 'Schedule kickoff call', status: 'pending' },
    { id: 'credentials', label: 'Request relevant credentials', status: 'pending' },
    { id: 'project_board', label: 'Create project task board', status: 'pending' },
    { id: 'timeline', label: 'Share project timeline', status: 'pending' },
  ],
}

export async function startOnboarding(
  supabase: SupabaseClient,
  orgId: string,
  clientSlug: string,
  projectType: string
): Promise<OnboardingChecklist> {
  const steps = DEFAULT_STEPS[projectType] || DEFAULT_STEPS.default

  // Create onboarding tasks on the kanban board
  const { data: todoColumn } = await supabase
    .from('kanban_columns')
    .select('id')
    .eq('org_id', orgId)
    .eq('title', 'To Do')
    .single()

  if (todoColumn) {
    for (let i = 0; i < steps.length; i++) {
      await supabase.from('tasks').insert({
        org_id: orgId,
        title: `[Onboarding] ${steps[i].label}`,
        description: `Onboarding step for ${clientSlug}: ${steps[i].label}`,
        status: 'pending',
        priority: i < 2 ? 'high' : 'medium',
        column_id: todoColumn.id,
        position: i,
        metadata: { source: 'onboarding', client: clientSlug, step_id: steps[i].id },
      })
    }
  }

  // Log activity
  await supabase.from('activity_feed').insert({
    org_id: orgId,
    action_type: 'onboarding_started',
    action: `Client onboarding started for ${clientSlug}`,
    reasoning: `Project type: ${projectType}. ${steps.length} steps created.`,
    result: JSON.stringify({ clientSlug, projectType, stepCount: steps.length }),
  })

  return { clientSlug, projectType, steps }
}

export async function updateOnboardingStep(
  supabase: SupabaseClient,
  orgId: string,
  clientSlug: string,
  stepId: string,
  status: 'pending' | 'in_progress' | 'complete' | 'blocked',
  notes?: string
): Promise<void> {
  // Update the corresponding task
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, metadata')
    .eq('org_id', orgId)
    .contains('metadata', { source: 'onboarding', client: clientSlug, step_id: stepId })
    .limit(1)

  if (tasks?.[0]) {
    const taskStatus = status === 'complete' ? 'completed' : status === 'in_progress' ? 'in_progress' : 'pending'
    await supabase
      .from('tasks')
      .update({ status: taskStatus, description: notes || undefined })
      .eq('id', tasks[0].id)
  }
}

export const clientOnboarding = {
  start: startOnboarding,
  updateStep: updateOnboardingStep,
}

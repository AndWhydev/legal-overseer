import type { SupabaseClient } from '@supabase/supabase-js'
import { createAsanaTask, fetchAsanaProjects, type AsanaError } from '@/lib/channels/asana'
import { createCalendlyBookingLink, fetchCalendlyEventTypes, type CalendlyError } from '@/lib/channels/calendly'
import { sendWelcomeEmail, sendCredentialRequestEmail } from './onboarding-emails'
import { createApproval } from './approval-queue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'complete' | 'blocked'
  notes?: string
}

export interface OnboardingChecklist {
  clientSlug: string
  projectType: string
  steps: OnboardingStep[]
  completedAt?: string
}

export interface CredentialItem {
  name: string
  description: string
  received: boolean
}

export interface OnboardingRecord {
  id: string
  org_id: string
  proposal_id: string | null
  client_contact_id: string | null
  client_slug: string
  project_type: string
  status: 'active' | 'complete' | 'cancelled'
  checklist: OnboardingStep[]
  credentials: CredentialItem[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OnboardingTickResult {
  processed: number
  welcomesSent: number
  credentialReminders: number
  projectsCreated: number
  failed: number
}

// ---------------------------------------------------------------------------
// Default Steps by Project Type
// ---------------------------------------------------------------------------

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
  ecommerce: [
    { id: 'welcome_email', label: 'Send welcome email package', status: 'pending' },
    { id: 'kickoff_call', label: 'Schedule kickoff call', status: 'pending' },
    { id: 'credentials', label: 'Request hosting/DNS/payment credentials', status: 'pending' },
    { id: 'products', label: 'Collect product catalog data', status: 'pending' },
    { id: 'analytics', label: 'Set up GSC + Analytics access', status: 'pending' },
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

const DEFAULT_CREDENTIALS: Record<string, CredentialItem[]> = {
  website: [
    { name: 'Hosting / cPanel', description: 'Server access credentials', received: false },
    { name: 'Domain Registrar', description: 'DNS management access', received: false },
    { name: 'CMS Admin', description: 'Existing website admin login', received: false },
    { name: 'Google Analytics', description: 'GA4 property access', received: false },
    { name: 'Google Search Console', description: 'GSC property access', received: false },
  ],
  mobile_app: [
    { name: 'App Store Connect', description: 'Apple developer account access', received: false },
    { name: 'Google Play Console', description: 'Android developer account access', received: false },
    { name: 'Firebase', description: 'Firebase project access', received: false },
  ],
  default: [
    { name: 'Project Access', description: 'Relevant project credentials', received: false },
  ],
}

function getStepsForType(projectType: string): OnboardingStep[] {
  return (DEFAULT_STEPS[projectType] || DEFAULT_STEPS.default).map((s) => ({ ...s }))
}

function getCredentialsForType(projectType: string): CredentialItem[] {
  return (DEFAULT_CREDENTIALS[projectType] || DEFAULT_CREDENTIALS.default).map((c) => ({ ...c }))
}

// ---------------------------------------------------------------------------
// Trigger: Proposal Accepted -> Start Onboarding
// ---------------------------------------------------------------------------

export async function triggerOnboardingFromProposal(
  supabase: SupabaseClient,
  orgId: string,
  proposalId: string,
  agentConfigId: string,
): Promise<OnboardingRecord | null> {
  // Fetch proposal
  const { data: proposal, error: propError } = await supabase
    .from('proposals')
    .select('id, client_contact_id, project_type, title, timeline, metadata')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .single()

  if (propError || !proposal) return null

  // Resolve client
  let clientSlug = 'unknown'
  let clientName = 'Client'
  let clientEmail: string | null = null

  if (proposal.client_contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('slug, name, email')
      .eq('id', proposal.client_contact_id)
      .single()

    if (contact) {
      clientSlug = contact.slug || clientSlug
      clientName = contact.name || clientName
      clientEmail = contact.email || null
    }
  }

  const steps = getStepsForType(proposal.project_type)
  const credentials = getCredentialsForType(proposal.project_type)

  // Create onboarding record
  const { data: onboarding, error: onbError } = await supabase
    .from('onboardings')
    .insert({
      org_id: orgId,
      proposal_id: proposalId,
      client_contact_id: proposal.client_contact_id,
      client_slug: clientSlug,
      project_type: proposal.project_type,
      status: 'active',
      checklist: JSON.stringify(steps),
      credentials: JSON.stringify(credentials),
      metadata: {
        project_title: proposal.title,
        timeline: proposal.timeline,
        client_name: clientName,
        client_email: clientEmail,
        agent_config_id: agentConfigId,
      },
    })
    .select('*')
    .single()

  if (onbError || !onboarding) {
    // Fallback: write to tasks kanban like old code
    return startOnboardingLegacy(supabase, orgId, clientSlug, proposal.project_type)
  }

  // Log activity
  await supabase.from('activity_feed').insert({
    org_id: orgId,
    action_type: 'onboarding_started',
    action: `Client onboarding started for ${clientName}`,
    reasoning: `Proposal accepted: ${proposal.title}. ${steps.length} steps created.`,
    result: JSON.stringify({ proposalId, clientSlug, projectType: proposal.project_type }),
  })

  return onboarding as unknown as OnboardingRecord
}

// ---------------------------------------------------------------------------
// Legacy: Start onboarding via kanban tasks (fallback if no onboardings table)
// ---------------------------------------------------------------------------

async function startOnboardingLegacy(
  supabase: SupabaseClient,
  orgId: string,
  clientSlug: string,
  projectType: string,
): Promise<OnboardingRecord | null> {
  const steps = getStepsForType(projectType)

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

  await supabase.from('activity_feed').insert({
    org_id: orgId,
    action_type: 'onboarding_started',
    action: `Client onboarding started for ${clientSlug}`,
    reasoning: `Project type: ${projectType}. ${steps.length} steps created.`,
    result: JSON.stringify({ clientSlug, projectType, stepCount: steps.length }),
  })

  return null
}

// ---------------------------------------------------------------------------
// Start Onboarding (manual, without proposal)
// ---------------------------------------------------------------------------

export async function startOnboarding(
  supabase: SupabaseClient,
  orgId: string,
  clientSlug: string,
  projectType: string,
): Promise<OnboardingChecklist> {
  const steps = getStepsForType(projectType)

  // Try the new onboardings table first
  const { error: insertError } = await supabase.from('onboardings').insert({
    org_id: orgId,
    client_slug: clientSlug,
    project_type: projectType,
    status: 'active',
    checklist: JSON.stringify(steps),
    credentials: JSON.stringify(getCredentialsForType(projectType)),
    metadata: {},
  })

  if (insertError) {
    // Fallback to legacy kanban
    await startOnboardingLegacy(supabase, orgId, clientSlug, projectType)
  }

  return { clientSlug, projectType, steps }
}

// ---------------------------------------------------------------------------
// Step Management
// ---------------------------------------------------------------------------

export async function updateOnboardingStep(
  supabase: SupabaseClient,
  orgId: string,
  clientSlug: string,
  stepId: string,
  status: OnboardingStep['status'],
  notes?: string,
): Promise<void> {
  // Try onboardings table
  const { data: onboarding } = await supabase
    .from('onboardings')
    .select('id, checklist')
    .eq('org_id', orgId)
    .eq('client_slug', clientSlug)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (onboarding) {
    const checklist = (typeof onboarding.checklist === 'string'
      ? JSON.parse(onboarding.checklist)
      : onboarding.checklist) as OnboardingStep[]

    const updated = checklist.map((step) =>
      step.id === stepId ? { ...step, status, notes: notes ?? step.notes } : step,
    )

    const allComplete = updated.every((s) => s.status === 'complete')

    await supabase
      .from('onboardings')
      .update({
        checklist: JSON.stringify(updated),
        status: allComplete ? 'complete' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', onboarding.id)

    return
  }

  // Fallback: update task
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

// ---------------------------------------------------------------------------
// Credential Management
// ---------------------------------------------------------------------------

export async function updateCredentialStatus(
  supabase: SupabaseClient,
  orgId: string,
  onboardingId: string,
  credentialName: string,
  received: boolean,
): Promise<void> {
  const { data: onboarding } = await supabase
    .from('onboardings')
    .select('id, credentials, checklist')
    .eq('id', onboardingId)
    .eq('org_id', orgId)
    .single()

  if (!onboarding) return

  const credentials = (typeof onboarding.credentials === 'string'
    ? JSON.parse(onboarding.credentials)
    : onboarding.credentials) as CredentialItem[]

  const updated = credentials.map((c) =>
    c.name === credentialName ? { ...c, received } : c,
  )

  await supabase
    .from('onboardings')
    .update({ credentials: JSON.stringify(updated), updated_at: new Date().toISOString() })
    .eq('id', onboardingId)

  // If all credentials received, mark the credentials step complete
  if (updated.every((c) => c.received)) {
    const checklist = (typeof onboarding.checklist === 'string'
      ? JSON.parse(onboarding.checklist)
      : onboarding.checklist) as OnboardingStep[]

    const credStep = checklist.find((s) => s.id === 'credentials')
    if (credStep && credStep.status !== 'complete') {
      const updatedChecklist = checklist.map((s) =>
        s.id === 'credentials' ? { ...s, status: 'complete' as const } : s,
      )
      await supabase
        .from('onboardings')
        .update({ checklist: JSON.stringify(updatedChecklist) })
        .eq('id', onboardingId)
    }
  }
}

// ---------------------------------------------------------------------------
// Asana Project Creation
// ---------------------------------------------------------------------------

export async function createAsanaProject(
  supabase: SupabaseClient,
  orgId: string,
  clientName: string,
  projectType: string,
  steps: OnboardingStep[],
): Promise<{ success: boolean; error?: string }> {
  // Get first workspace
  const projects = await fetchAsanaProjects(supabase, orgId, '')
  if ('error' in projects) {
    // No Asana configured, skip silently
    return { success: false, error: (projects as AsanaError).error }
  }

  // Create tasks for each onboarding step
  for (const step of steps) {
    const result = await createAsanaTask(supabase, orgId, {
      name: `[${clientName}] ${step.label}`,
      notes: `Onboarding step for ${clientName} (${projectType})`,
    })

    if ('error' in result) {
      return { success: false, error: (result as AsanaError).error }
    }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Kickoff Call Scheduling
// ---------------------------------------------------------------------------

export async function scheduleKickoffCall(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ bookingUrl: string | null; error?: string }> {
  const eventTypes = await fetchCalendlyEventTypes(supabase, orgId)

  if ('error' in eventTypes) {
    return { bookingUrl: null, error: (eventTypes as CalendlyError).error }
  }

  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    return { bookingUrl: null, error: 'No active Calendly event types found' }
  }

  // Find a "kickoff" event type, or use the first one
  const kickoff = eventTypes.find(
    (et) => et.name.toLowerCase().includes('kickoff') || et.slug.includes('kickoff'),
  ) || eventTypes[0]

  return { bookingUrl: kickoff.scheduling_url }
}

// ---------------------------------------------------------------------------
// Onboarding Completion Check
// ---------------------------------------------------------------------------

export async function getOnboardingStatus(
  supabase: SupabaseClient,
  orgId: string,
  onboardingId: string,
): Promise<{
  checklist: OnboardingStep[]
  credentials: CredentialItem[]
  completionPercent: number
  status: string
} | null> {
  const { data } = await supabase
    .from('onboardings')
    .select('checklist, credentials, status')
    .eq('id', onboardingId)
    .eq('org_id', orgId)
    .single()

  if (!data) return null

  const checklist = (typeof data.checklist === 'string' ? JSON.parse(data.checklist) : data.checklist) as OnboardingStep[]
  const credentials = (typeof data.credentials === 'string' ? JSON.parse(data.credentials) : data.credentials) as CredentialItem[]

  const totalItems = checklist.length + credentials.length
  const completedItems = checklist.filter((s) => s.status === 'complete').length + credentials.filter((c) => c.received).length
  const completionPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  return { checklist, credentials, completionPercent, status: data.status }
}

// ---------------------------------------------------------------------------
// Scheduler Tick: Auto-process onboarding workflows
// ---------------------------------------------------------------------------

export async function runOnboardingTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<OnboardingTickResult> {
  const result: OnboardingTickResult = {
    processed: 0, welcomesSent: 0, credentialReminders: 0, projectsCreated: 0, failed: 0,
  }

  try {
    // 1. Check for newly accepted proposals that need onboarding
    const { data: acceptedProposals } = await supabase
      .from('proposals')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'accepted')

    if (acceptedProposals) {
      for (const proposal of acceptedProposals) {
        // Check if onboarding already exists for this proposal
        const { data: existing } = await supabase
          .from('onboardings')
          .select('id')
          .eq('org_id', orgId)
          .eq('proposal_id', proposal.id)
          .limit(1)

        if (!existing || existing.length === 0) {
          try {
            await triggerOnboardingFromProposal(supabase, orgId, proposal.id, agentConfigId)
            result.processed += 1
          } catch {
            result.failed += 1
          }
        }
      }
    }

    // 2. Process active onboardings - send welcome emails, credential reminders
    const { data: activeOnboardings } = await supabase
      .from('onboardings')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'active')

    if (activeOnboardings) {
      for (const onb of activeOnboardings as unknown as OnboardingRecord[]) {
        result.processed += 1
        const metadata = onb.metadata || {}
        const clientEmail = metadata.client_email as string | null
        const clientName = metadata.client_name as string || onb.client_slug

        const checklist = (typeof onb.checklist === 'string' ? JSON.parse(onb.checklist as unknown as string) : onb.checklist) as OnboardingStep[]
        const credentials = (typeof onb.credentials === 'string' ? JSON.parse(onb.credentials as unknown as string) : onb.credentials) as CredentialItem[]

        // Send welcome email if step is pending
        const welcomeStep = checklist.find((s) => s.id === 'welcome_email')
        if (welcomeStep?.status === 'pending' && clientEmail) {
          try {
            // Get kickoff booking URL
            const { bookingUrl } = await scheduleKickoffCall(supabase, orgId)

            await sendWelcomeEmail({
              clientName,
              clientEmail,
              projectType: onb.project_type,
              projectTitle: (metadata.project_title as string) || `${onb.project_type} project`,
              timeline: (metadata.timeline as string) || '4-8 weeks',
              kickoffBookingUrl: bookingUrl || undefined,
            })

            await updateOnboardingStep(supabase, orgId, onb.client_slug, 'welcome_email', 'complete')
            result.welcomesSent += 1
          } catch {
            result.failed += 1
          }
        }

        // Send credential reminders for pending credentials (3+ days after creation)
        const credStep = checklist.find((s) => s.id === 'credentials')
        if (credStep?.status !== 'complete' && clientEmail) {
          const pendingCreds = credentials.filter((c) => !c.received)
          if (pendingCreds.length > 0) {
            const createdDate = new Date(onb.created_at)
            const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
            const reminderCount = (metadata.credential_reminder_count as number) || 0

            // Send reminder every 3 days, max 3 reminders
            if (daysSinceCreation > 3 * (reminderCount + 1) && reminderCount < 3) {
              try {
                await sendCredentialRequestEmail({
                  clientName,
                  clientEmail,
                  projectTitle: (metadata.project_title as string) || `${onb.project_type} project`,
                  credentials,
                  reminderNumber: reminderCount + 1,
                })

                await supabase
                  .from('onboardings')
                  .update({
                    metadata: { ...metadata, credential_reminder_count: reminderCount + 1 },
                  })
                  .eq('id', onb.id)

                result.credentialReminders += 1
              } catch {
                result.failed += 1
              }
            }
          }
        }

        // Create Asana project board if step is pending
        const boardStep = checklist.find((s) => s.id === 'project_board')
        if (boardStep?.status === 'pending') {
          const asanaResult = await createAsanaProject(supabase, orgId, clientName, onb.project_type, checklist)
          if (asanaResult.success) {
            await updateOnboardingStep(supabase, orgId, onb.client_slug, 'project_board', 'complete')
            result.projectsCreated += 1
          }
          // Don't count Asana failures as overall failures (might not be configured)
        }
      }
    }
  } catch {
    result.failed += 1
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const clientOnboarding = {
  start: startOnboarding,
  triggerFromProposal: triggerOnboardingFromProposal,
  updateStep: updateOnboardingStep,
  updateCredential: updateCredentialStatus,
  getStatus: getOnboardingStatus,
  scheduleKickoff: scheduleKickoffCall,
  tick: runOnboardingTick,
}

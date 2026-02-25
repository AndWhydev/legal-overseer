import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommsTemplate {
  id: string
  org_id: string
  name: string
  category: string
  subject_template?: string
  body_template: string
  voice_profile?: string
  channel?: string
  variables: Record<string, string>
  usage_count: number
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

/**
 * Get a template by name for an org.
 */
export async function getTemplate(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
): Promise<CommsTemplate | null> {
  const { data } = await supabase
    .from('templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('name', name)
    .single()

  if (!data) return null

  // Increment usage count (fire and forget)
  void supabase
    .from('templates')
    .update({ usage_count: (data.usage_count || 0) + 1 })
    .eq('id', data.id)

  return data as CommsTemplate
}

/**
 * List templates for an org, optionally filtered by category.
 */
export async function listTemplates(
  supabase: SupabaseClient,
  orgId: string,
  category?: string,
): Promise<CommsTemplate[]> {
  let query = supabase
    .from('templates')
    .select('*')
    .eq('org_id', orgId)
    .order('usage_count', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data } = await query
  return (data || []) as CommsTemplate[]
}

/**
 * Create or update a template.
 */
export async function upsertTemplate(
  supabase: SupabaseClient,
  orgId: string,
  template: Omit<CommsTemplate, 'id' | 'org_id' | 'usage_count'>,
): Promise<CommsTemplate | null> {
  const { data, error } = await supabase
    .from('templates')
    .upsert(
      {
        org_id: orgId,
        name: template.name,
        category: template.category,
        subject_template: template.subject_template,
        body_template: template.body_template,
        voice_profile: template.voice_profile,
        channel: template.channel,
        variables: template.variables,
      },
      { onConflict: 'org_id,name' },
    )
    .select('*')
    .single()

  if (error) {
    console.warn('[templates] Upsert failed:', error.message)
    return null
  }

  return data as CommsTemplate
}

// ---------------------------------------------------------------------------
// Template merging
// ---------------------------------------------------------------------------

/**
 * Replace {variable} placeholders in a template string with provided values.
 * Unmatched placeholders are left as-is.
 */
export function mergeTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return variables[key] !== undefined ? variables[key] : match
  })
}

// ---------------------------------------------------------------------------
// Seed default templates
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: Omit<CommsTemplate, 'id' | 'org_id' | 'usage_count'>[] = [
  {
    name: 'onboarding_welcome',
    category: 'onboarding',
    subject_template: 'Welcome to {org}!',
    body_template: `Hi {name},

Welcome to {org}! We're excited to get started on your project.

Here's what happens next:
1. We'll schedule a kickoff call to align on goals
2. You'll receive a request for any credentials we need
3. We'll set up your project workspace

Looking forward to working together!

{sign_off}`,
    variables: { name: 'Client name', org: 'Organization name', sign_off: 'Sign-off' },
  },
  {
    name: 'project_milestone',
    category: 'follow-up',
    subject_template: 'Project Update: Milestone Reached',
    body_template: `Hi {name},

Quick update on your project -- we've hit a milestone:

{milestone_details}

Next steps: {next_steps}

{sign_off}`,
    variables: { name: 'Client name', milestone_details: 'What was achieved', next_steps: 'What comes next', sign_off: 'Sign-off' },
  },
  {
    name: 'payment_received',
    category: 'notification',
    subject_template: 'Payment Received - Thank You',
    body_template: `Hi {name},

Just confirming we've received your payment of {amount} for invoice {invoice_ref}. Thanks for the prompt payment!

If you need a receipt or have any questions, just let me know.

{sign_off}`,
    variables: { name: 'Client name', amount: 'Payment amount', invoice_ref: 'Invoice reference', sign_off: 'Sign-off' },
  },
  {
    name: 'meeting_followup',
    category: 'follow-up',
    subject_template: 'Follow-up: Our Call Today',
    body_template: `Hi {name},

Thanks for the call today. Here's a quick recap:

{recap}

Action items:
{action_items}

Let me know if I missed anything.

{sign_off}`,
    variables: { name: 'Client name', recap: 'Meeting summary', action_items: 'Action items list', sign_off: 'Sign-off' },
  },
  {
    name: 'weekly_status',
    category: 'follow-up',
    subject_template: 'Weekly Status Update - {project_name}',
    body_template: `Hi {name},

Here's your weekly project update:

Completed this week:
{completed}

In progress:
{in_progress}

Coming up next week:
{upcoming}

Let me know if you want to adjust priorities.

{sign_off}`,
    variables: { name: 'Client name', project_name: 'Project name', completed: 'Done items', in_progress: 'Active items', upcoming: 'Next items', sign_off: 'Sign-off' },
  },
]

/**
 * Seed default templates for an org if they don't exist.
 */
export async function seedDefaultTemplates(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  let created = 0
  for (const template of DEFAULT_TEMPLATES) {
    const existing = await getTemplate(supabase, orgId, template.name)
    if (!existing) {
      const result = await upsertTemplate(supabase, orgId, template)
      if (result) created++
    }
  }
  return created
}

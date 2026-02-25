import type { SupabaseClient } from '@supabase/supabase-js'

export interface ApprovalItem {
  id: string
  agent_type: string
  action_type: string
  description: string
  confidence: number
  payload: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

/**
 * Get pending approvals for a user/org.
 */
export async function getPendingApprovals(
  supabase: SupabaseClient,
  orgId: string,
  limit: number = 5
): Promise<ApprovalItem[]> {
  const { data } = await supabase
    .from('approval_queue')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []) as ApprovalItem[]
}

/**
 * Format pending approvals for WhatsApp display.
 */
export function formatApprovalsForWhatsApp(approvals: ApprovalItem[]): string {
  if (!approvals.length) return '✅ No pending approvals!'

  const lines = approvals.map((a, i) =>
    `${i + 1}. *[${a.agent_type}]* ${a.description}\n   Confidence: ${Math.round(a.confidence * 100)}%\n   Reply "${i + 1}" to approve, "${i + 1}n" to reject`
  )

  return `⏳ *Pending Approvals (${approvals.length})*\n\n${lines.join('\n\n')}`
}

/**
 * Handle an approval/rejection response from WhatsApp.
 * Expects format: "1" (approve item 1), "1n" (reject item 1), "Y" (approve most recent)
 */
export async function handleApprovalResponse(
  supabase: SupabaseClient,
  orgId: string,
  response: string
): Promise<{ success: boolean; message: string }> {
  const trimmed = response.trim().toLowerCase()

  // Get pending approvals
  const approvals = await getPendingApprovals(supabase, orgId)
  if (!approvals.length) {
    return { success: true, message: 'No pending approvals to act on.' }
  }

  // Parse response
  let index = 0
  let approve = true

  if (trimmed === 'y' || trimmed === 'yes') {
    index = 0
    approve = true
  } else if (trimmed === 'n' || trimmed === 'no') {
    index = 0
    approve = false
  } else {
    const match = trimmed.match(/^(\d+)(n)?$/)
    if (!match) {
      return { success: false, message: 'Reply with a number (e.g., "1" to approve, "1n" to reject).' }
    }
    index = parseInt(match[1], 10) - 1
    approve = !match[2]
  }

  if (index < 0 || index >= approvals.length) {
    return { success: false, message: `Invalid selection. Choose 1-${approvals.length}.` }
  }

  const target = approvals[index]
  const newStatus = approve ? 'approved' : 'rejected'

  await supabase
    .from('approval_queue')
    .update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', target.id)

  const emoji = approve ? '✅' : '❌'
  return {
    success: true,
    message: `${emoji} ${approve ? 'Approved' : 'Rejected'}: ${target.description}`,
  }
}

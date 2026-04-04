import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// Tools eligible for graduation (high-impact, currently L2_propose)
const GRADUATION_CANDIDATES = ['send_email', 'send_gmail', 'send_outlook', 'send_sms']

// Graduation requirements
const MIN_SAMPLES = 20
const MIN_APPROVAL_RATE = 0.95
const GRADUATION_TARGET = 'L3_notify' // Graduate to L3 (notify), never L4 (silent)

export interface GraduationResult {
  tool: string
  currentLevel: string
  graduated: boolean
  samples: number
  approvalRate: number
}

export async function checkGraduations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<GraduationResult[]> {
  const results: GraduationResult[] = []

  for (const tool of GRADUATION_CANDIDATES) {
    // Check action_outcomes for this tool in last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: outcomes } = await supabase
      .from('action_outcomes')
      .select('was_approved')
      .eq('org_id', orgId)
      .eq('action_type', tool)
      .gte('created_at', thirtyDaysAgo.toISOString())

    if (!outcomes || outcomes.length < MIN_SAMPLES) {
      results.push({ tool, currentLevel: 'L2_propose', graduated: false, samples: outcomes?.length ?? 0, approvalRate: 0 })
      continue
    }

    const approved = outcomes.filter(o => o.was_approved).length
    const rate = approved / outcomes.length

    if (rate >= MIN_APPROVAL_RATE) {
      // Graduate! Update org autonomy overrides
      const { data: org } = await supabase
        .from('organisations')
        .select('settings')
        .eq('id', orgId)
        .single()

      const settings = (org?.settings || {}) as Record<string, unknown>
      const overrides = (settings.autonomy_overrides || {}) as Record<string, string>

      if (overrides[tool] !== GRADUATION_TARGET) {
        overrides[tool] = GRADUATION_TARGET
        await supabase
          .from('organisations')
          .update({ settings: { ...settings, autonomy_overrides: overrides } })
          .eq('id', orgId)

        logger.info(`[autonomy-graduation] ${tool} graduated to ${GRADUATION_TARGET} for org ${orgId} (${outcomes.length} samples, ${(rate * 100).toFixed(1)}% approval)`)
      }

      results.push({ tool, currentLevel: GRADUATION_TARGET, graduated: true, samples: outcomes.length, approvalRate: rate })
    } else {
      results.push({ tool, currentLevel: 'L2_propose', graduated: false, samples: outcomes.length, approvalRate: rate })
    }
  }

  return results
}

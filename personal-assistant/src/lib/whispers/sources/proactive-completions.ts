import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

function truncateWhisper(text: string, max = 50): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf(' ', max - 3)
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 3)) + '...'
}

export async function whisperProactiveCompletions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Whisper[]> {
  // Find recent autonomous actions BitBit completed that the user hasn't confirmed
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: completions } = await supabase
    .from('approval_queue')
    .select('id, action_type, action_summary, execution_completed_at')
    .eq('org_id', orgId)
    .eq('status', 'completed')
    .gte('execution_completed_at', oneDayAgo)
    .order('execution_completed_at', { ascending: false })
    .limit(3)

  if (!completions?.length) return []

  return completions.map((completion) => {
    const summary = completion.action_summary
    const displayText = summary
      ? truncateWhisper(`Done: ${summary}`)
      : 'Handled a task for you'

    return {
      text: displayText,
      score: 0.45,
      source: 'proactive_completions',
      context: {
        approvalId: completion.id,
        actionType: completion.action_type,
        actionSummary: completion.action_summary,
      },
    }
  })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Whisper } from '../types'

function truncateWhisper(text: string, max = 50): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf(' ', max - 3)
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 3)) + '...'
}

export async function whisperUnfinishedMomentum(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<Whisper[]> {
  // Find the most recent active conversation thread that had activity in the last 48h
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: threads } = await supabase
    .from('conversation_threads')
    .select('id, title, last_activity_at, compiled_summary')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gte('last_activity_at', twoDaysAgo)
    .order('last_activity_at', { ascending: false })
    .limit(3)

  if (!threads?.length) return []

  const whispers: Whisper[] = []

  for (const thread of threads) {
    // Use title or compiled summary as the topic
    const topic = thread.title || thread.compiled_summary
    if (!topic) continue

    const lastAt = new Date(thread.last_activity_at).getTime()
    const hoursSince = (Date.now() - lastAt) / (60 * 60 * 1000)

    // Score: recent threads score higher (decays over 48h)
    const recency = Math.max(0, 1 - hoursSince / 48)
    const score = 0.3 + recency * 0.5

    whispers.push({
      text: truncateWhisper(`Continue ${topic}`),
      score,
      source: 'unfinished_momentum',
      context: {
        threadId: thread.id,
        topic: thread.title,
        summary: thread.compiled_summary,
      },
    })
  }

  return whispers
}

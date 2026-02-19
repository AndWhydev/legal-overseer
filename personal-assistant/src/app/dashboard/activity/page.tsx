import { redirect } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { ActivityFeed } from '@/components/activity/activity-feed'
import type { ActivityEntry } from '@/lib/types'

export default async function ActivityPage() {
  let activities: ActivityEntry[] = []

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data: { user } } = await supabase!.auth.getUser()
    if (!user) redirect('/login')

    const { data } = await supabase!
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    activities = (data ?? []) as ActivityEntry[]
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Activity Feed</h1>
      <ActivityFeed activities={activities} />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { DashboardRedesign } from '@/components/dashboard/dashboard-redesign'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { KanbanColumn, Task } from '@/lib/types'

export default async function DashboardPage() {
  let columns: KanbanColumn[] = []
  let tasks: Task[] = []
  let messages: any[] = []

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data: { user } } = await supabase!.auth.getUser()
    if (!user) redirect('/login')

    const { data: cols } = await supabase!
      .from('kanban_columns')
      .select('*')
      .order('position')

    const { data: tks } = await supabase!
      .from('tasks')
      .select('*')
      .order('position')

    columns = (cols ?? []) as KanbanColumn[]
    tasks = (tks ?? []) as Task[]

    const { data: msgs } = await supabase!
      .from('channel_messages')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(20)
    messages = msgs ?? []
  }

  const today = new Date().toISOString().split('T')[0]
  const completedToday = tasks.filter(t =>
    t.status === 'completed' && t.updated_at.startsWith(today)
  ).length
  const activeTasks = tasks.filter(t => t.status !== 'archived')

  return (
    <DashboardRedesign
      columns={columns}
      tasks={tasks}
      messages={messages}
      completedToday={completedToday}
      totalActive={activeTasks.length}
    />
  )
}

import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from '@/components/dashboard/kanban-board'
import { GreetingBar } from '@/components/dashboard/greeting-bar'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { KanbanColumn, Task } from '@/lib/types'

export default async function DashboardPage() {
  let columns: KanbanColumn[] = []
  let tasks: Task[] = []

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
  }

  // Calculate completion stats for dopaminergic UX
  const today = new Date().toISOString().split('T')[0]
  const completedToday = tasks.filter(t =>
    t.status === 'completed' && t.updated_at.startsWith(today)
  ).length
  const activeTasks = tasks.filter(t => t.status !== 'archived')

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <GreetingBar
          completedToday={completedToday}
          totalToday={activeTasks.length}
          currentStreak={0}
        />
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <KanbanBoard initialColumns={columns} initialTasks={tasks} />
      </div>
    </div>
  )
}

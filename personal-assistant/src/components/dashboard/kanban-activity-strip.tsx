'use client'

import type { Task } from '@/lib/types'

interface KanbanActivityStripProps {
  tasks: Task[]
}

export function KanbanActivityStrip({ tasks }: KanbanActivityStripProps) {
  const activeTasks = tasks.filter((t) => {
    const status = (t.metadata as Record<string, unknown>)?.agentStatus
    return t.assigned_to && status === 'working'
  })

  if (activeTasks.length === 0) return null

  return (
    <div style={{
      borderTop: '1px solid transparent',
      borderImage: 'linear-gradient(90deg, rgba(255,90,31,0.2), rgba(255,90,31,0.2), rgba(255,90,31,0.2), rgba(255,90,31,0.2), rgba(255,90,31,0.2)) 1',
      padding: '6px 0',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      overflowX: 'auto',
      flexShrink: 0,
      marginBottom: 4,
    }}>
      {activeTasks.map((task) => (
        <div
          key={task.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#FF5A1F',
            animation: 'bb-pulse 2s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
            BitBit
          </span>
          <span style={{ color: 'var(--text-dim)' }}>
            working on &ldquo;{task.title.length > 40 ? task.title.slice(0, 40) + '...' : task.title}&rdquo;
          </span>
        </div>
      ))}

      <style>{`
        @keyframes bb-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}

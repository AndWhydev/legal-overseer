import { cn } from '@/lib/utils'

interface AgentBadgeProps {
  agent: string
  status?: 'working' | 'done' | 'error'
}

export function AgentBadge({ agent, status = 'working' }: AgentBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'working' && 'bg-[#D4A574]/20 text-[#D4A574] animate-agent-pulse',
        status === 'done' && 'bg-[#71717A]/15 text-[#71717A]',
        status === 'error' && 'bg-[#EF4444]/20 text-[#EF4444]'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'working' && 'bg-[#D4A574] animate-pulse',
          status === 'done' && 'bg-[#71717A]',
          status === 'error' && 'bg-[#EF4444]'
        )}
      />
      {agent}
    </span>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { Icon } from '@iconify/react'

const ENTITY_ICONS: Record<string, { icon: string; color: string }> = {
  person: { icon: 'lucide:user', color: 'text-blue-400' },
  project: { icon: 'lucide:folder-kanban', color: 'text-purple-400' },
  company: { icon: 'lucide:building-2', color: 'text-emerald-400' },
  invoice: { icon: 'lucide:receipt', color: 'text-amber-400' },
  channel: { icon: 'lucide:message-circle', color: 'text-cyan-400' },
  community: { icon: 'lucide:users', color: 'text-pink-400' },
}

interface EntityChipProps {
  name: string
  type: string
  subtitle?: string
  className?: string
  onClick?: () => void
}

export function EntityChip({ name, type, subtitle, className, onClick }: EntityChipProps) {
  const config = ENTITY_ICONS[type] || { icon: 'lucide:hash', color: 'text-muted-foreground' }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg',
        'bg-muted/60 hover:bg-muted border border-border/50',
        'text-sm font-medium text-foreground',
        'transition-colors cursor-pointer',
        'align-baseline',
        className,
      )}
    >
      <Icon icon={config.icon} width={14} height={14} className={cn('shrink-0', config.color)} />
      <span className="truncate max-w-[160px]">{name}</span>
      {subtitle && (
        <span className="text-muted-foreground text-xs truncate max-w-[80px]">{subtitle}</span>
      )}
    </button>
  )
}

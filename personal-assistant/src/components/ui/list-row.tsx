'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ListRowProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  selected?: boolean;
  unread?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ListRow({
  icon,
  children,
  meta,
  actions,
  selected = false,
  unread = false,
  onClick,
  className,
}: ListRowProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
        'hover:bg-[var(--bb-surface-hover)]',
        selected && 'bg-[var(--bb-surface-active)] ring-1 ring-[var(--bb-orange)]/20',
        unread && 'border-l-2 border-l-[var(--bb-orange)]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
      {meta && (
        <div className="shrink-0 text-right text-xs text-[var(--text-dim)]">
          {meta}
        </div>
      )}
      {actions && (
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </Component>
  );
}

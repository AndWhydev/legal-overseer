import React from 'react';
import { cn } from '@/lib/utils';

export type StatusVariant =
  | 'success' | 'warning' | 'error' | 'info'
  | 'neutral' | 'orange' | 'purple' | 'cyan';

interface StatusPillProps {
  variant: StatusVariant;
  label: string;
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<StatusVariant, string> = {
  success: 'bg-[var(--bb-green)]/12 text-[var(--bb-green)] border-[var(--bb-green)]/20',
  warning: 'bg-[var(--bb-amber)]/12 text-[var(--bb-amber)] border-[var(--bb-amber)]/20',
  error: 'bg-[var(--bb-red)]/12 text-[var(--bb-red)] border-[var(--bb-red)]/20',
  info: 'bg-[var(--bb-blue)]/12 text-[var(--bb-blue)] border-[var(--bb-blue)]/20',
  neutral: 'bg-white/5 text-[var(--text-secondary)] border-white/10',
  orange: 'bg-[var(--bb-orange)]/12 text-[var(--bb-orange)] border-[var(--bb-orange)]/20',
  purple: 'bg-[var(--bb-purple)]/12 text-[var(--bb-purple)] border-[var(--bb-purple)]/20',
  cyan: 'bg-[var(--bb-cyan)]/12 text-[var(--bb-cyan)] border-[var(--bb-cyan)]/20',
};

export function StatusPill({ variant, label, icon, dot = false, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3" aria-hidden="true">{icon}</span>}
      {label}
    </span>
  );
}

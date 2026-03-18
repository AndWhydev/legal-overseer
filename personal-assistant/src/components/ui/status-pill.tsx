import React from 'react';

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

const COLORS: Record<StatusVariant, { fg: string; bg: string; border: string }> = {
  success: { fg: 'var(--status-success-fg)', bg: 'var(--status-success-bg)', border: 'var(--status-success-border)' },
  warning: { fg: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', border: 'var(--status-warning-border)' },
  error: { fg: 'var(--status-error-fg)', bg: 'var(--status-error-bg)', border: 'var(--status-error-border)' },
  info: { fg: 'var(--status-info-fg)', bg: 'var(--status-info-bg)', border: 'var(--status-info-border)' },
  neutral: { fg: 'var(--status-neutral-fg)', bg: 'var(--status-neutral-bg)', border: 'var(--status-neutral-border)' },
  orange: { fg: 'var(--status-orange-fg)', bg: 'var(--status-orange-bg)', border: 'var(--status-orange-border)' },
  purple: { fg: 'var(--status-purple-fg)', bg: 'var(--status-purple-bg)', border: 'var(--status-purple-border)' },
  cyan: { fg: 'var(--status-cyan-fg)', bg: 'var(--status-cyan-bg)', border: 'var(--status-cyan-border)' },
};

export function StatusPill({ variant, label, icon, dot = false, className }: StatusPillProps) {
  const c = COLORS[variant];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 9999,
        border: `1px solid ${c.border}`,
        padding: '4px 12px',
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.3,
        color: c.fg,
        background: c.bg,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: c.fg,
            flexShrink: 0,
          }}
        />
      )}
      {icon && <span style={{ display: 'flex' }} aria-hidden="true">{icon}</span>}
      {label}
    </span>
  );
}

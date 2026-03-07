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
  success: { fg: '#22C55E', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.15)' },
  warning: { fg: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.15)' },
  error:   { fg: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.15)' },
  info:    { fg: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.15)' },
  neutral: { fg: '#94A3B8', bg: 'rgba(255, 255, 255, 0.05)', border: 'rgba(255, 255, 255, 0.08)' },
  orange:  { fg: '#FF5A1F', bg: 'rgba(255, 90, 31, 0.12)', border: 'rgba(255, 90, 31, 0.15)' },
  purple:  { fg: '#A855F7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.15)' },
  cyan:    { fg: '#06B6D4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.15)' },
};

export function StatusPill({ variant, label, icon, dot = false, className }: StatusPillProps) {
  const c = COLORS[variant];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 99,
        border: `1px solid ${c.border}`,
        padding: '5px 12px',
        fontSize: 12,
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

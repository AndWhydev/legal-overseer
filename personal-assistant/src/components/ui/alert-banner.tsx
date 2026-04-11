'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertBannerProps {
  variant: AlertVariant;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  info: 'border-[var(--bb-blue)]/20 bg-[var(--bb-blue)]/8',
  success: 'border-[var(--bb-green)]/20 bg-[var(--bb-green)]/8',
  warning: 'border-[var(--bb-amber)]/20 bg-[var(--bb-amber)]/8',
  error: 'border-[var(--bb-red)]/20 bg-[var(--bb-red)]/8',
};

const VARIANT_ICON_STYLES: Record<AlertVariant, string> = {
  info: 'text-[var(--bb-blue)]',
  success: 'text-[var(--bb-green)]',
  warning: 'text-[var(--bb-amber)]',
  error: 'text-[var(--bb-red)]',
};

const VARIANT_ICONS: Record<AlertVariant, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function AlertBanner({
  variant,
  children,
  dismissible = false,
  onDismiss,
  className,
}: AlertBannerProps) {
  const Icon = VARIANT_ICONS[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', VARIANT_ICON_STYLES[variant])} aria-hidden="true" />
      <div className="flex-1 text-foreground">{children}</div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 min-h-[44px] min-w-[44px] -m-1 flex items-center justify-center"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

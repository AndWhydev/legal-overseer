import React from 'react';
import { cn } from '@/lib/utils';

interface TabShellProps {
  children: React.ReactNode;
  scrollable?: boolean;
  padding?: string;
  variant?: 'default' | 'fixed' | 'split';
  className?: string;
}

export function TabShell({
  children,
  scrollable = true,
  padding = 'p-6',
  variant = 'default',
  className,
}: TabShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        padding,
        scrollable && variant !== 'fixed' && 'overflow-y-auto',
        variant === 'fixed' && 'h-full overflow-hidden',
        variant === 'split' && 'md:grid md:grid-cols-2 md:flex-none',
        className,
      )}
      style={variant !== 'fixed' ? { maxHeight: '100%' } : { height: '100%' }}
    >
      {children}
    </div>
  );
}

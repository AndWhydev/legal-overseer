import React from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, headerActions, children, className }: SectionCardProps) {
  return (
    <div
      className={cn('rounded-xl p-4', className)}
      style={{
        background: 'var(--bb-surface)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid rgba(255, 255, 255, 0.04)',
      }}
    >
      {(title || headerActions) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

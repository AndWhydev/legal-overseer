'use client';

import React from 'react';

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function WidgetCard({ title, subtitle, icon, action, className, children }: WidgetCardProps) {
  return (
    <div className={`bb-card ${className ?? ''}`}>
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium flex items-center gap-2">
            {icon} {title}
          </h2>
          {action}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

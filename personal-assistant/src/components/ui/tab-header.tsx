import React from 'react';

interface TabHeaderProps {
  icon: React.ReactNode | React.ComponentType<{ size?: number }>;
  iconColor?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode[];
}

export function TabHeader({ icon, iconColor = 'var(--bb-orange)', title, subtitle, actions }: TabHeaderProps) {
  // Support both component references (e.g. Lucide icons) and ReactNode elements
  const iconElement = typeof icon === 'function'
    ? React.createElement(icon, { size: 20 })
    : icon;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${iconColor} 15%, transparent)`,
            color: iconColor,
          }}
        >
          {iconElement}
        </div>
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

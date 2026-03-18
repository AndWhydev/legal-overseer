'use client';

import React from 'react';

export interface NotificationBadgeProps {
  count: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  maxDisplay?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Reusable notification badge component for displaying count indicators
 * across sidebar nav items, topbar elements, etc.
 *
 * Features:
 * - Automatic truncation (9+ display)
 * - Theme-aware color system with CSS custom properties
 * - Smooth pulse animation when count > 0
 * - Flexible sizing (sm/md/lg)
 * - Accessible with aria-label
 */
export function NotificationBadge({
  count,
  color = 'var(--bb-red)',
  size = 'md',
  animate = false,
  maxDisplay = 99,
  ariaLabel,
  className,
}: NotificationBadgeProps) {
  // Don't render if count is 0
  if (count <= 0) return null;

  // Size mappings
  const sizeMap = {
    sm: { width: 16, height: 16, fontSize: 14, padding: 2 },
    md: { width: 20, height: 20, fontSize: 14, padding: 2 },
    lg: { width: 24, height: 24, fontSize: 14, padding: 4 },
  };

  const dims = sizeMap[size];
  const displayCount = count > maxDisplay ? `${maxDisplay}+` : count;

  return (
    <span
      className={className}
      style={{
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        width: `${dims.width}px`,
        height: `${dims.height}px`,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${dims.fontSize}px`,
        fontWeight: 500,
        color: '#FFFFFF',
        lineHeight: 1,
        flexShrink: 0,
        animation: animate ? 'bb-badge-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined,
        boxShadow: `0 0 0 2px var(--bg-primary, #0A0A0B), 0 2px 4px rgba(0, 0, 0, 0.2)`,
      }}
      role="status"
      aria-label={ariaLabel || `${count} notifications`}
      aria-hidden={!ariaLabel}
    >
      {displayCount}

      <style>{`
        @keyframes bb-badge-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
      `}</style>
    </span>
  );
}

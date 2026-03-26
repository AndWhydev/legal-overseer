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

  // Size mappings — sm for collapsed rail, md for panel items, lg for topbar
  const sizeMap = {
    sm: { minWidth: 16, height: 16, fontSize: 10, padding: '0 4px' },
    md: { minWidth: 18, height: 18, fontSize: 11, padding: '0 5px' },
    lg: { minWidth: 22, height: 22, fontSize: 12, padding: '0 6px' },
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
        minWidth: `${dims.minWidth}px`,
        height: `${dims.height}px`,
        borderRadius: '9999px',
        backgroundColor: color,
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: dims.padding,
        fontSize: `${dims.fontSize}px`,
        fontWeight: 500,
        color: '#FFFFFF',
        lineHeight: 1,
        flexShrink: 0,
        boxSizing: 'border-box',
        animation: animate ? 'bb-badge-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined,
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

'use client';

import React from 'react';

/**
 * Hidden SVG containing directional motion blur filters.
 * Y-axis only blur (stdDeviation="0,N") for vertical page transitions.
 * Rendered once at document level.
 */
export function MotionBlurSVG() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <defs>
        {/* Standard vertical motion blur */}
        <filter id="motion-blur-y">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0,8" />
        </filter>
        {/* Animated: ramps 0 → peak → 0 over 300ms */}
        <filter id="motion-blur-y-animated">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0,0">
            <animate
              attributeName="stdDeviation"
              values="0,0; 0,12; 0,0"
              dur="300ms"
              fill="freeze"
            />
          </feGaussianBlur>
        </filter>
      </defs>
    </svg>
  );
}

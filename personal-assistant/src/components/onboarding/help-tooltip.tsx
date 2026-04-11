'use client';

import React, { useState, useEffect, useRef } from 'react';
import { IconHelpCircle, IconX } from '@tabler/icons-react';

interface HelpTooltipProps {
  tooltipKey: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  icon?: React.ReactNode;
  onDismiss?: () => void;
}

export function HelpTooltip({
  tooltipKey,
  title,
  description,
  placement = 'top',
  children,
  icon,
  onDismiss,
}: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isDontShowAgain, setIsDontShowAgain] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const storageKey = `bitbit-help-dismissed-${tooltipKey}`;

  // Check if already dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey) === 'true';
    if (dismissed) {
      setIsVisible(false);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    if (isDontShowAgain) {
      localStorage.setItem(storageKey, 'true');
    }
    setIsVisible(false);
    onDismiss?.();
  };

  // Close tooltip on click outside
  useEffect(() => {
    if (!showTooltip) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  if (!isVisible) return <>{children}</>;

  // Compute tooltip position classes
  const getTooltipPositionClasses = (): string => {
    switch (placement) {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2';
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2';
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2';
      default:
        return '';
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-2"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}

      {/* Pulsing indicator dot */}
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className="relative w-8 h-8 p-0 bg-transparent border-none cursor-pointer inline-flex items-center justify-center shrink-0"
        aria-label={`Help: ${title}`}
        title={title}
      >
        {/* Pulsing background */}
        <div className="absolute inset-0 rounded-full bg-secondary animate-[bitbit-help-pulse_2s_ease-in-out_infinite]" />
        {/* Icon */}
        <div className="relative z-10">
          {icon || <IconHelpCircle size={16} className="text-foreground" />}
        </div>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 bg-popover border border-border rounded-xl px-4 py-3 min-w-60 max-w-80 shadow-lg pointer-events-auto ${getTooltipPositionClasses()}`}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="flex justify-between items-start gap-2 mb-2">
            <h4 className="text-sm font-medium text-foreground">
              {title}
            </h4>
            <button
              onClick={handleDismiss}
              className="bg-transparent border-none p-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center justify-center"
              aria-label="Close help"
            >
              <IconX size={14} />
            </button>
          </div>

          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDontShowAgain}
              onChange={(e) => setIsDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 cursor-pointer accent-foreground"
            />
            Don't show again
          </label>
        </div>
      )}

      {/* Keyframes for pulsing animation */}
      <style>{`
        @keyframes bitbit-help-pulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
}

export default HelpTooltip;

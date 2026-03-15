'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, X } from 'lucide-react';

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

  // Compute tooltip position styles
  const getTooltipStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      position: 'absolute',
      zIndex: 50,
      background: 'rgba(15, 20, 30, 0.95)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 12,
      padding: '12px 16px',
      minWidth: '240px',
      maxWidth: '320px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      pointerEvents: 'auto',
    };

    switch (placement) {
      case 'top':
        return {
          ...baseStyles,
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 8,
        };
      case 'bottom':
        return {
          ...baseStyles,
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 8,
        };
      case 'left':
        return {
          ...baseStyles,
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginRight: 8,
        };
      case 'right':
        return {
          ...baseStyles,
          left: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginLeft: 8,
        };
      default:
        return baseStyles;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}

      {/* Pulsing indicator dot */}
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          position: 'relative',
          width: 20,
          height: 20,
          padding: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={`Help: ${title}`}
        title={title}
      >
        {/* Pulsing background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(255, 90, 31, 0.2)',
            animation: 'bitbit-help-pulse 2s ease-in-out infinite',
          }}
        />
        {/* Icon */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {icon || <HelpCircle size={16} style={{ color: '#FF5A1F' }} />}
        </div>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          style={getTooltipStyles()}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary, #F1F5F9)',
              }}
            >
              {title}
            </h4>
            <button
              onClick={handleDismiss}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-secondary, #94A3B8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-primary, #F1F5F9)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = 'var(--text-secondary, #94A3B8)';
              }}
              aria-label="Close help"
            >
              <X size={14} />
            </button>
          </div>

          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text-secondary, #94A3B8)',
            }}
          >
            {description}
          </p>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-secondary, #94A3B8)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={isDontShowAgain}
              onChange={(e) => setIsDontShowAgain(e.target.checked)}
              style={{
                width: 14,
                height: 14,
                cursor: 'pointer',
                accentColor: '#FF5A1F',
              }}
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

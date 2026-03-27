'use client';

import React from 'react';
import Image from 'next/image';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  const [actionHovered, setActionHovered] = React.useState(false);
  const [secondaryHovered, setSecondaryHovered] = React.useState(false);

  const showDefaultLogo = !icon;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 300,
        padding: '64px 24px',
        gap: 16,
        textAlign: 'center',
      }}
      role="status"
      data-testid="empty-state"
    >
      {showDefaultLogo ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
          }}
          aria-hidden="true"
        >
          <Image
            src="/bitbit-logo.svg"
            alt=""
            width={48}
            height={48}
            style={{
              opacity: 0.25,
              filter: 'var(--empty-icon-filter, grayscale(1) invert(1) brightness(1.5))',
            }}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            color: 'var(--text-dim)',
            opacity: 0.5,
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      <h3
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: 0,
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          onMouseEnter={() => setActionHovered(true)}
          onMouseLeave={() => setActionHovered(false)}
          style={{
            marginTop: 16,
            height: 40,
            padding: '0 20px',
            borderRadius: 8,
            background: 'var(--btn-primary-bg, #F1F5F9)',
            border: 'none',
            color: 'var(--btn-primary-fg, #0a0f1a)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 200ms ease',
            transform: actionHovered ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: actionHovered ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none',
          }}
        >
          {action.label}
        </button>
      )}

      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          onMouseEnter={() => setSecondaryHovered(true)}
          onMouseLeave={() => setSecondaryHovered(false)}
          style={{
            marginTop: action ? 8 : 16,
            height: 40,
            padding: '0 20px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: secondaryHovered
              ? 'var(--text-primary, #F1F5F9)'
              : 'var(--text-secondary, #94A3B8)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'color 200ms ease',
          }}
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}

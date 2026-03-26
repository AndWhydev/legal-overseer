'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Gauge, Handshake, ShieldCheck, Settings } from 'lucide-react';

// ── Tour Steps ──────────────────────────────────────────────────────────────

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  tabId?: string;
  position: 'center' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to BitBit',
    description: 'Quick tour — 30 seconds and you\'ll know where everything is.',
    icon: Gauge,
    position: 'center',
  },
  {
    id: 'command-center',
    title: 'Dashboard',
    description: 'Approvals, tasks, leads, and anything that needs attention — all here.',
    icon: Gauge,
    tabId: 'dashboard',
    position: 'center',
  },
  {
    id: 'chat',
    title: 'Chat',
    description: 'We can draft emails, check invoices, look things up — across all connected tools.',
    icon: Handshake,
    tabId: 'chat',
    position: 'center',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    description: 'Before sending anything or taking action, decisions that need sign-off come here first.',
    icon: ShieldCheck,
    tabId: 'approvals',
    position: 'center',
  },
  {
    id: 'settings',
    title: 'Connections & Settings',
    description: 'Add or remove connected services, and adjust how BitBit works.',
    icon: Settings,
    tabId: 'settings-connections',
    position: 'center',
  },
];

const STORAGE_KEY = 'bb-onboarding-complete';

// ── Component ───────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  onNavigate?: (tabId: string) => void;
  tourVariant?: 'full' | 'essential';
}

export function OnboardingTour({ onNavigate }: OnboardingTourProps) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const persistCompletion = useCallback(async () => {
    try {
      await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // localStorage completion is still the fallback
    }
  }, []);

  // Check if tour has been completed (localStorage fast-path + server verify)
  useEffect(() => {
    const localComplete = localStorage.getItem(STORAGE_KEY);
    if (localComplete === 'true') return;

    // Verify against server state
    const checkServer = async () => {
      try {
        const res = await fetch('/api/profile/preferences');
        if (res.ok) {
          const { preferences } = await res.json();
          if (preferences?.onboarding_completed) {
            localStorage.setItem(STORAGE_KEY, 'true');
            return;
          }
        }
      } catch {
        // Fall through to show tour
      }
      // Small delay to let the dashboard load first
      setActive(true);
    };

    const timer = setTimeout(checkServer, 2000);
    return () => clearTimeout(timer);
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
    void persistCompletion();
  }, [persistCompletion]);

  const nextStep = useCallback(() => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      const next = stepIndex + 1;
      setStepIndex(next);
      const nextTab = TOUR_STEPS[next].tabId;
      if (nextTab) onNavigate?.(nextTab);
    } else {
      completeTour();
    }
  }, [stepIndex, onNavigate, completeTour]);

  const prevStep = useCallback(() => {
    if (stepIndex > 0) {
      const prev = stepIndex - 1;
      setStepIndex(prev);
      const prevTab = TOUR_STEPS[prev].tabId;
      if (prevTab) onNavigate?.(prevTab);
    }
  }, [stepIndex, onNavigate]);

  if (!active) return null;

  const step = TOUR_STEPS[stepIndex];
  const Icon = step.icon;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Overlay backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={completeTour}
      />

      {/* Tour card */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: '100%',
          maxWidth: '420px',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            background: 'var(--bg-card)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Close button */}
          <button
            onClick={completeTour}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
            aria-label="Close tour"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(255, 107, 53, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <Icon size={24} style={{ color: 'var(--bb-orange)' }} />
          </div>

          {/* Content */}
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          >
            {step.title}
          </h3>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
            }}
          >
            {step.description}
          </p>

          {/* Progress + Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Step dots */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? '20px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    background:
                      i === stepIndex
                        ? 'var(--bb-orange)'
                        : 'rgba(255, 255, 255, 0.2)',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {stepIndex > 0 && (
                <button
                  onClick={prevStep}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--glass-hover-bg)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              <button
                onClick={nextStep}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#1A1A1B',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
              >
                {isLast ? "Let's go!" : 'Next'} {!isLast && <ArrowRight size={14} />}
              </button>
            </div>
          </div>

          {/* Skip link */}
          <button
            onClick={completeTour}
            style={{
              display: 'block',
              margin: '16px auto 0',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            Skip tour
          </button>
        </div>
      </div>
    </>
  );
}

export default OnboardingTour;

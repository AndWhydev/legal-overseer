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
    description: 'Your personal command center. Let me show you around in 30 seconds.',
    icon: Gauge,
    position: 'center',
  },
  {
    id: 'command-center',
    title: 'Command Center',
    description: 'This is your home base. See pending approvals, hot leads, overdue tasks, and quick actions all in one place.',
    icon: Gauge,
    tabId: 'command-center',
    position: 'center',
  },
  {
    id: 'leads',
    title: 'Leads Pipeline',
    description: 'Track your sales pipeline from first contact to closed deal. BitBit automatically captures and scores new leads.',
    icon: Handshake,
    tabId: 'leads',
    position: 'center',
  },
  {
    id: 'approvals',
    title: 'Approve Agent Actions',
    description: 'When BitBit agents want to send emails, create invoices, or take actions on your behalf, they ask for your approval here.',
    icon: ShieldCheck,
    tabId: 'approvals',
    position: 'center',
  },
  {
    id: 'settings',
    title: 'Settings & Integrations',
    description: 'Connect your email, calendar, and other services. Configure how BitBit agents behave.',
    icon: Settings,
    tabId: 'settings',
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

  // Check if tour has been completed
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Small delay to let the dashboard load first
      const timer = setTimeout(() => setActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const completeTour = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
  }, []);

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
          background: 'rgba(0, 0, 0, 0.6)',
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
            background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
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
            <Icon size={24} style={{ color: 'var(--bb-orange, #ff6b35)' }} />
          </div>

          {/* Content */}
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: '18px',
              fontWeight: 600,
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
            <div style={{ display: 'flex', gap: '6px' }}>
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === stepIndex ? '20px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    background:
                      i === stepIndex
                        ? 'var(--bb-orange, #ff6b35)'
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
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
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
                  background: 'var(--bb-orange, #ff6b35)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
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
              fontSize: '12px',
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

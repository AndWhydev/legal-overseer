'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { IconX, IconArrowRight, IconArrowLeft, IconGauge, IconHandStop, IconShieldCheck, IconSettings } from '@tabler/icons-react';

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
    icon: IconGauge,
    position: 'center',
  },
  {
    id: 'command-center',
    title: 'Dashboard',
    description: 'Approvals, tasks, leads, and anything that needs attention — all here.',
    icon: IconGauge,
    tabId: 'dashboard',
    position: 'center',
  },
  {
    id: 'chat',
    title: 'Chat',
    description: 'We can draft emails, check invoices, look things up — across all connected tools.',
    icon: IconHandStop,
    tabId: 'chat',
    position: 'center',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    description: 'Before sending anything or taking action, decisions that need sign-off come here first.',
    icon: IconShieldCheck,
    tabId: 'approvals',
    position: 'center',
  },
  {
    id: 'settings',
    title: 'Connections & Settings',
    description: 'Add or remove connected services, and adjust how BitBit works.',
    icon: IconSettings,
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
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
        onClick={completeTour}
      />

      {/* Tour card */}
      <div
        className="fixed left-1/2 top-1/2 z-[9999] box-border w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 px-4"
      >
        <div
          className="rounded-2xl border border-border bg-card p-8 shadow-2xl backdrop-blur-3xl"
        >
          {/* Close button */}
          <button
            onClick={completeTour}
            className="absolute right-4 top-4 cursor-pointer border-none bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close tour"
          >
            <IconX size={18} />
          </button>

          {/* Icon */}
          <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-card">
            <Icon size={24} className="text-foreground" />
          </div>

          {/* Content */}
          <h3 className="mb-2 text-base font-medium text-foreground">
            {step.title}
          </h3>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            {step.description}
          </p>

          {/* Progress + Navigation */}
          <div className="flex items-center justify-between">
            {/* Step dots */}
            <div className="flex gap-2">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-lg transition-all duration-200 ${i === stepIndex ? 'w-5 bg-foreground' : 'w-1.5 bg-white/20'}`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button
                  onClick={prevStep}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <IconArrowLeft size={14} /> Back
                </button>
              )}
              <button
                onClick={nextStep}
                className="flex cursor-pointer items-center gap-1 rounded-lg border-none bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {isLast ? "Let's go!" : 'Next'} {!isLast && <IconArrowRight size={14} />}
              </button>
            </div>
          </div>

          {/* Skip link */}
          <button
            onClick={completeTour}
            className="mx-auto mt-4 block cursor-pointer border-none bg-transparent text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip tour
          </button>
        </div>
      </div>
    </>
  );
}

export default OnboardingTour;

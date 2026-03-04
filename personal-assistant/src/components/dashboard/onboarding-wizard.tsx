'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { ConnectionsGrid } from '@/components/connections/connections-grid';
import { BitBitLogoVideo } from '@/components/chat/bitbit-logo-video';

// ── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'connections' | 'crawling' | 'intro' | 'tour' | 'complete';

interface SpotlightStop {
  selector: string;
  tabId: string;
  title: string;
  description: string;
}

const SPOTLIGHT_STOPS: SpotlightStop[] = [
  {
    selector: '.bb-sidebar-area',
    tabId: 'dashboard',
    title: 'Navigation',
    description: 'Everything lives in the sidebar. Jump between your dashboard, chat, inbox, and all your tools.',
  },
  {
    selector: '#tabpanel-chat',
    tabId: 'chat',
    title: 'Chat with BitBit',
    description: 'Ask me anything — draft emails, chase invoices, look up contacts. I work across all your connected services.',
  },
  {
    selector: '#tabpanel-inbox',
    tabId: 'inbox',
    title: 'Unified Inbox',
    description: "All your messages from every connected service in one place. I'll triage and prioritize them for you.",
  },
  {
    selector: '#tabpanel-connections',
    tabId: 'connections',
    title: 'Connections',
    description: "Add more services anytime. The more I'm connected to, the more I can help.",
  },
];

const INTRO_MESSAGES = [
  "Hey! I'm BitBit \u2014 your personal operations engine.",
  "I just connected to your services and I'm already learning about your world.",
  "I'll keep building context in the background \u2014 the more you use me, the smarter I get.",
  "I can draft emails, chase invoices, manage your leads, and handle the boring stuff so you don't have to.",
  "Let me show you around \u2014 it'll take 30 seconds.",
];

const STORAGE_KEY = 'bb-onboarding-complete';

// ── Props ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onNavigate: (tabId: string) => void;
  onComplete: () => void;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function OnboardingWizard({ onNavigate, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>('connections');
  const [hasConnection, setHasConnection] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for first connection
  useEffect(() => {
    if (step !== 'connections') return;

    const checkConnections = async () => {
      try {
        const res = await fetch('/api/channels/status');
        if (!res.ok) return;
        const data = await res.json();
        const channels = data.channels || [];
        const connected = channels.some((ch: { connected: boolean }) => ch.connected);
        if (connected) {
          setHasConnection(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore
      }
    };

    checkConnections();
    pollRef.current = setInterval(checkConnections, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step]);

  const advanceToCrawl = useCallback(() => {
    // Trigger 30-day backfill
    fetch('/api/channels/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }),
    }).catch(() => { /* best effort */ });

    setStep('crawling');
    // Auto-advance after a brief moment
    setTimeout(() => setStep('intro'), 2500);
  }, []);

  const skipConnections = useCallback(() => {
    setStep('intro');
  }, []);

  const advanceToTour = useCallback(() => {
    setStep('tour');
  }, []);

  const completeWizard = useCallback(async () => {
    setStep('complete');
    localStorage.setItem(STORAGE_KEY, 'true');

    try {
      await fetch('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // localStorage is the fallback
    }

    onComplete();
  }, [onComplete]);

  return (
    <AnimatePresence mode="wait">
      {step === 'connections' && (
        <StepConnections
          key="connections"
          hasConnection={hasConnection}
          onContinue={advanceToCrawl}
          onSkip={skipConnections}
        />
      )}
      {step === 'crawling' && <StepCrawling key="crawling" />}
      {step === 'intro' && (
        <StepIntro
          key="intro"
          onContinue={advanceToTour}
          onSkip={advanceToTour}
        />
      )}
      {step === 'tour' && (
        <StepTour
          key="tour"
          onNavigate={onNavigate}
          onComplete={completeWizard}
        />
      )}
    </AnimatePresence>
  );
}

// ── Step 1: Connections ──────────────────────────────────────────────────────

function StepConnections({
  hasConnection,
  onContinue,
  onSkip,
}: {
  hasConnection: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      className="bb-onboarding-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bb-onboarding-wizard__backdrop" />
      <div className="bb-onboarding-wizard__content">
        <div className="bb-onboarding-wizard__panel" style={{ maxWidth: 680 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <Sparkles size={32} style={{ color: 'var(--bb-orange)' }} />
            </div>
            <h2 style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}>
              Connect your world
            </h2>
            <p style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              margin: 0,
            }}>
              Connect at least one service to get started. BitBit gets smarter with every connection.
            </p>
          </div>

          <ConnectionsGrid />

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            marginTop: 24,
          }}>
            {hasConnection && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bb-onboarding-wizard__btn-primary"
                onClick={onContinue}
              >
                Continue <ArrowRight size={16} />
              </motion.button>
            )}
            <button
              className="bb-onboarding-wizard__btn-skip"
              onClick={onSkip}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Step 2: Crawling ─────────────────────────────────────────────────────────

function StepCrawling() {
  return (
    <motion.div
      className="bb-onboarding-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bb-onboarding-wizard__backdrop" />
      <div className="bb-onboarding-wizard__content">
        <div className="bb-onboarding-wizard__panel" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ margin: '0 auto 24px', width: 80 }}>
            <BitBitLogoVideo size={80} variant="loading" />
          </div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
          }}>
            BitBit is learning about your world...
          </h2>
          <p style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: 0,
          }}>
            Pulling in the last 30 days of context. This continues in the background.
          </p>
          <div className="bb-onboarding-wizard__crawl-bar">
            <div className="bb-onboarding-wizard__crawl-bar-fill" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Step 3: BitBit Intro ─────────────────────────────────────────────────────

function StepIntro({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingIndex, setTypingIndex] = useState(0);

  useEffect(() => {
    if (typingIndex >= INTRO_MESSAGES.length) return;

    // Show typing indicator, then reveal message
    const typingDelay = setTimeout(() => {
      setVisibleCount(typingIndex + 1);
      setTypingIndex(typingIndex + 1);
    }, typingIndex === 0 ? 800 : 2200);

    return () => clearTimeout(typingDelay);
  }, [typingIndex]);

  const allVisible = visibleCount >= INTRO_MESSAGES.length;

  return (
    <motion.div
      className="bb-onboarding-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bb-onboarding-wizard__backdrop" />
      <div className="bb-onboarding-wizard__content">
        <div className="bb-onboarding-wizard__panel" style={{ maxWidth: 480 }}>
          <div className="bb-onboarding-chat">
            {INTRO_MESSAGES.slice(0, visibleCount).map((msg, i) => (
              <motion.div
                key={i}
                className="bb-onboarding-chat__bubble"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {i === 0 && (
                  <div className="bb-onboarding-chat__avatar">
                    <BitBitLogoVideo size={32} variant="pulse" />
                  </div>
                )}
                <div className="bb-onboarding-chat__text">{msg}</div>
              </motion.div>
            ))}

            {/* Typing indicator */}
            {!allVisible && (
              <motion.div
                className="bb-onboarding-chat__bubble"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {visibleCount === 0 && (
                  <div className="bb-onboarding-chat__avatar">
                    <BitBitLogoVideo size={32} variant="pulse" />
                  </div>
                )}
                <div className="bb-onboarding-chat__typing">
                  <span /><span /><span />
                </div>
              </motion.div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 24,
          }}>
            {allVisible ? (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bb-onboarding-wizard__btn-primary"
                onClick={onContinue}
              >
                Show me around <ArrowRight size={16} />
              </motion.button>
            ) : (
              <button className="bb-onboarding-wizard__btn-skip" onClick={onSkip}>
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Step 4: Spotlight Tour ───────────────────────────────────────────────────

function StepTour({
  onNavigate,
  onComplete,
}: {
  onNavigate: (tabId: string) => void;
  onComplete: () => void;
}) {
  const [stopIndex, setStopIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const stop = SPOTLIGHT_STOPS[stopIndex];
  const isLast = stopIndex === SPOTLIGHT_STOPS.length - 1;

  // Navigate to the stop's tab and measure the target element
  useEffect(() => {
    onNavigate(stop.tabId);

    const measure = () => {
      const el = document.querySelector(stop.selector);
      if (el) {
        setSpotlightRect(el.getBoundingClientRect());
      }
    };

    // Allow tab transition to settle
    const timer = setTimeout(measure, 300);
    return () => clearTimeout(timer);
  }, [stopIndex, stop, onNavigate]);

  // Remeasure on resize
  useEffect(() => {
    const handler = () => {
      const el = document.querySelector(stop.selector);
      if (el) setSpotlightRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [stop.selector]);

  const next = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setStopIndex(i => i + 1);
    }
  }, [isLast, onComplete]);

  const prev = useCallback(() => {
    if (stopIndex > 0) setStopIndex(i => i - 1);
  }, [stopIndex]);

  // Compute tooltip position (to the right of spotlight, or below on small screens)
  const tooltipStyle: React.CSSProperties = {};
  if (spotlightRect) {
    const tooltipWidth = Math.min(300, Math.max(220, window.innerWidth - 32));
    const maxLeft = Math.max(16, window.innerWidth - tooltipWidth - 16);
    const maxTop = Math.max(16, window.innerHeight - 220);
    const rightSpace = window.innerWidth - spotlightRect.right;
    if (rightSpace > tooltipWidth + 40) {
      tooltipStyle.top = Math.min(maxTop, Math.max(16, spotlightRect.top + 16));
      tooltipStyle.left = Math.min(maxLeft, Math.max(16, spotlightRect.right + 16));
    } else {
      tooltipStyle.top = Math.min(maxTop, Math.max(16, spotlightRect.bottom + 16));
      tooltipStyle.left = Math.min(maxLeft, Math.max(16, spotlightRect.left));
    }
    tooltipStyle.width = tooltipWidth;
  }

  return (
    <motion.div
      className="bb-onboarding-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Spotlight overlay with cutout */}
      <div className="bb-onboarding-spotlight">
        {spotlightRect && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <mask id="spotlight-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={spotlightRect.left - 8}
                  y={spotlightRect.top - 8}
                  width={spotlightRect.width + 16}
                  height={spotlightRect.height + 16}
                  rx="12"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0, 0, 0, 0.7)"
              mask="url(#spotlight-mask)"
            />
          </svg>
        )}
      </div>

      {/* Spotlight ring */}
      {spotlightRect && (
        <div
          className="bb-onboarding-spotlight__ring"
          style={{
            top: spotlightRect.top - 8,
            left: spotlightRect.left - 8,
            width: spotlightRect.width + 16,
            height: spotlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <motion.div
        className="bb-onboarding-tooltip"
        style={tooltipStyle}
        key={stopIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
      >
        <h3 className="bb-onboarding-tooltip__title">{stop.title}</h3>
        <p className="bb-onboarding-tooltip__desc">{stop.description}</p>

        {/* Progress + Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {SPOTLIGHT_STOPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stopIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === stopIndex ? 'var(--bb-orange)' : 'rgba(255,255,255,0.2)',
                  transition: 'all 0.2s',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {stopIndex > 0 && (
              <button className="bb-onboarding-tooltip__btn-back" onClick={prev}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button className="bb-onboarding-tooltip__btn-next" onClick={next}>
              {isLast ? "Let's go!" : 'Next'} {!isLast && <ArrowRight size={14} />}
            </button>
          </div>
        </div>

        <button className="bb-onboarding-wizard__btn-skip" onClick={onComplete} style={{ marginTop: 8 }}>
          Skip tour
        </button>
      </motion.div>
    </motion.div>
  );
}

export default OnboardingWizard;

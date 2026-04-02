'use client';

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconX } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export interface VoiceConversationOverlayProps {
  isOpen: boolean;
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  audioLevel: number;
  frequencyData: Uint8Array | null;
  transcript: string | null;
  lastResponse: string | null;
  error: string | null;
  onTap: () => void;
  onClose: () => void;
}

const STATE_LABELS: Record<VoiceConversationOverlayProps['state'], string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

export function VoiceConversationOverlay({
  isOpen,
  state,
  audioLevel,
  frequencyData,
  transcript,
  lastResponse,
  error,
  onTap,
  onClose,
}: VoiceConversationOverlayProps) {
  // Clamp audioLevel to 0-1
  const level = Math.max(0, Math.min(1, audioLevel));

  // Compute orb scale based on state + audioLevel
  const orbScale = useMemo(() => {
    switch (state) {
      case 'listening':
        return 1 + level * 0.5;
      case 'thinking':
        return 1; // handled by CSS animation
      case 'speaking':
        return 1 + level * 0.3;
      default:
        return 1;
    }
  }, [state, level]);

  // Orb colour classes per state
  const orbColorClass = useMemo(() => {
    switch (state) {
      case 'listening':
        return 'bg-emerald-500/80 shadow-emerald-500/40';
      case 'thinking':
        return 'bg-amber-400/80 shadow-amber-400/40';
      case 'speaking':
        return 'bg-indigo-500/80 shadow-indigo-500/40';
      default:
        return 'bg-zinc-600/60 shadow-zinc-600/20';
    }
  }, [state]);

  // Orb glow ring colour
  const orbRingClass = useMemo(() => {
    switch (state) {
      case 'listening':
        return 'border-emerald-500/30';
      case 'thinking':
        return 'border-amber-400/30';
      case 'speaking':
        return 'border-indigo-500/30';
      default:
        return 'border-zinc-600/20';
    }
  }, [state]);

  const displayLabel = error || STATE_LABELS[state];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="voice-overlay"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--sidebar,#202020)]"
          onClick={onTap}
          role="dialog"
          aria-label="Voice conversation"
          aria-modal="true"
        >
          {/* Close button — top-right, stop propagation so it doesn't trigger onTap */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              'absolute top-4 right-4 z-10',
              'flex items-center justify-center',
              'h-10 w-10 rounded-full',
              'text-zinc-400 hover:text-zinc-100',
              'hover:bg-white/10 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
            )}
            aria-label="Close voice mode"
          >
            <IconX size={22} />
          </button>

          {/* Orb container */}
          <div className="relative flex items-center justify-center mb-8">
            {/* Outer glow ring */}
            <div
              className={cn(
                'absolute rounded-full border-2 transition-all duration-300',
                orbRingClass,
                state === 'listening' && 'w-[160px] h-[160px]',
                state === 'thinking' && 'w-[152px] h-[152px] animate-[voice-orb-slow-pulse_2.5s_ease-in-out_infinite]',
                state === 'speaking' && 'w-[156px] h-[156px] animate-[voice-orb-rhythmic-pulse_1.2s_ease-in-out_infinite]',
                state === 'idle' && 'w-[140px] h-[140px]',
              )}
              style={
                state === 'listening'
                  ? { transform: `scale(${1 + level * 0.3})`, opacity: 0.5 + level * 0.5 }
                  : undefined
              }
            />

            {/* Main orb */}
            <div
              className={cn(
                'w-[120px] h-[120px] rounded-full transition-colors duration-500',
                'shadow-[0_0_60px_10px]',
                orbColorClass,
                state === 'thinking' && 'animate-[voice-orb-slow-pulse_2s_ease-in-out_infinite]',
                state === 'speaking' && 'animate-[voice-orb-rhythmic-pulse_1s_ease-in-out_infinite]',
              )}
              style={{
                transform: `scale(${orbScale})`,
                transition: state === 'listening' ? 'transform 80ms ease-out' : 'transform 300ms ease-in-out',
              }}
            />
          </div>

          {/* State label */}
          <AnimatePresence mode="wait">
            <motion.p
              key={error ? 'error' : state}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'text-sm font-medium tracking-wide mb-6',
                error ? 'text-red-400' : 'text-zinc-300',
              )}
            >
              {displayLabel}
            </motion.p>
          </AnimatePresence>

          {/* Transcript (what user said) */}
          {transcript && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm italic text-zinc-500 text-center max-w-[320px] px-4 mb-3 line-clamp-2"
            >
              &ldquo;{transcript}&rdquo;
            </motion.p>
          )}

          {/* Last response (what AI said) */}
          {lastResponse && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-base text-zinc-200 text-center max-w-[380px] px-4 line-clamp-3 leading-relaxed"
            >
              {lastResponse}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}